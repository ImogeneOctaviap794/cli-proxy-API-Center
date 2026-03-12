package main

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"
)

// autoExportUsage 从 CLI-Proxy 导出使用记录并写入数据库
func autoExportUsage() {
	log.Println("[Usage] 开始自动同步使用记录...")

	body, statusCode, err := cliProxyGet("/usage/export")
	if err != nil {
		log.Printf("[Usage] 同步失败: %v\n", err)
		return
	}
	if statusCode != 200 {
		log.Printf("[Usage] 同步失败: HTTP %d\n", statusCode)
		return
	}

	var exportData map[string]interface{}
	if err := json.Unmarshal(body, &exportData); err != nil {
		log.Printf("[Usage] 解析失败: %v\n", err)
		return
	}

	usageRaw, ok := exportData["usage"]
	if !ok {
		log.Println("[Usage] 无 usage 数据")
		return
	}
	usage, ok := usageRaw.(map[string]interface{})
	if !ok {
		log.Println("[Usage] usage 格式错误")
		return
	}

	// 提取记录并增量插入数据库
	records := extractUsageRecords(usage)
	if len(records) > 0 {
		inserted, err := insertUsageBatch(records)
		if err != nil {
			log.Printf("[Usage] 插入失败: %v\n", err)
		} else {
			log.Printf("[Usage] 插入 %d 条新记录（总共 %d 条）\n", inserted, len(records))
		}
	}

	// 更新同步状态
	exportedAt := toString(exportData["exported_at"])
	updateSyncState(time.Now().UTC().Format(time.RFC3339), exportedAt)

	// 更新 key-provider 缓存
	updateKeyProviderCacheFromUsage(usage)

	// 通知前端有新数据
	usageSSE.Broadcast(map[string]interface{}{"inserted": len(records)})

	log.Println("[Usage] 同步完成")
}

// updateKeyProviderCacheFromUsage 批量更新缓存
func updateKeyProviderCacheFromUsage(usage map[string]interface{}) {
	apisRaw, ok := usage["apis"]
	if !ok {
		return
	}
	apis, ok := apisRaw.(map[string]interface{})
	if !ok {
		return
	}

	cache := getKeyProviderCache()

	// 构建 source -> provider 映射
	configMap := buildSourceProviderMap()
	authIndexMap := fetchAuthIndexMap()

	updated := false

	for _, apiDataRaw := range apis {
		apiData, ok := apiDataRaw.(map[string]interface{})
		if !ok {
			continue
		}
		modelsRaw, ok := apiData["models"]
		if !ok {
			continue
		}
		models, ok := modelsRaw.(map[string]interface{})
		if !ok {
			continue
		}

		for _, modelDataRaw := range models {
			modelData, ok := modelDataRaw.(map[string]interface{})
			if !ok {
				continue
			}
			detailsRaw, ok := modelData["details"]
			if !ok {
				continue
			}
			details, ok := detailsRaw.([]interface{})
			if !ok {
				continue
			}

			for _, detailRaw := range details {
				detail, ok := detailRaw.(map[string]interface{})
				if !ok {
					continue
				}

				source := toString(detail["source"])
				authIndex := toString(detail["auth_index"])
				if source == "" {
					continue
				}

				cacheKey := authIndex
				if cacheKey == "" {
					cacheKey = source
				}

				// 如果缓存中已有完整信息，跳过
				if info, exists := cache[cacheKey]; exists && info.Provider != "" && info.Channel != "" {
					continue
				}

				// 优先从 auth-files API 获取
				if authIndex != "" {
					if authInfo, exists := authIndexMap[authIndex]; exists {
						provider := strings.ToUpper(toString(authInfo["type"]))
						if provider == "" {
							provider = "UNKNOWN"
						}
						upsertKeyProvider(cacheKey, KeyProviderInfo{
							Provider: provider,
							Channel:  toString(authInfo["type"]),
							Email:    toString(authInfo["email"]),
							Source:   source,
						})
						updated = true
						continue
					}
				}

				// 检查 API Key 映射
				if info, exists := configMap[source]; exists {
					upsertKeyProvider(cacheKey, KeyProviderInfo{
						Provider: info.Provider,
						Channel:  info.Channel,
						Source:   source,
					})
					updated = true
				}
			}
		}
	}

	if updated {
		log.Println("[Cache] Key-Provider 缓存已更新")
	}
}

// buildSourceProviderMap 从 API 构建 source -> provider 映射
func buildSourceProviderMap() map[string]KeyProviderInfo {
	m := map[string]KeyProviderInfo{}

	body, statusCode, err := cliProxyGet("/openai-compatibility")
	if err != nil || statusCode != 200 {
		return m
	}

	sites := parseSitesList(body)
	for _, siteRaw := range sites {
		site, ok := siteRaw.(map[string]interface{})
		if !ok {
			continue
		}
		providerName := toString(site["name"])

		entriesRaw, ok := site["api-key-entries"].([]interface{})
		if !ok {
			continue
		}
		for _, entryRaw := range entriesRaw {
			entry, ok := entryRaw.(map[string]interface{})
			if !ok {
				continue
			}
			apiKey := toString(entry["api-key"])
			if apiKey != "" {
				m[apiKey] = KeyProviderInfo{
					Provider: providerName,
					Channel:  "api-key",
				}
			}
		}
	}
	return m
}

// fetchAuthIndexMap 从 CLI-Proxy 获取 auth_index 到渠道的映射
func fetchAuthIndexMap() map[string]map[string]interface{} {
	m := map[string]map[string]interface{}{}

	body, statusCode, err := cliProxyGet("/auth-files")
	if err != nil || statusCode != 200 {
		return m
	}

	var data struct {
		Files []map[string]interface{} `json:"files"`
	}
	if err := json.Unmarshal(body, &data); err != nil {
		var files []map[string]interface{}
		if err := json.Unmarshal(body, &files); err == nil {
			data.Files = files
		}
	}

	for _, file := range data.Files {
		authIndex := toString(file["auth_index"])
		if authIndex == "" {
			continue
		}
		email := toString(file["email"])
		if email == "" {
			email = toString(file["account"])
		}
		m[authIndex] = map[string]interface{}{
			"email": email,
			"type":  coalesce(toString(file["type"]), toString(file["provider"])),
			"name":  coalesce(toString(file["name"]), toString(file["id"])),
			"label": file["label"],
		}
	}
	return m
}

// startUsageExportScheduler 启动定时同步
func startUsageExportScheduler() {
	// 启动时立即同步一次
	go autoExportUsage()

	go func() {
		for {
			interval := time.Duration(getSyncInterval()) * time.Minute
			time.Sleep(interval)
			autoExportUsage()
		}
	}()

	interval := getSyncInterval()
	fmt.Printf("[Usage] 定时同步已启动，间隔: %d分钟\n", interval)
}
