package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sync"

	"github.com/gin-gonic/gin"
)

type AuthFile struct {
	Name      string                 `json:"name"`
	Email     string                 `json:"email"`
	Account   string                 `json:"account"`
	AuthIndex string                 `json:"auth_index"`
	Type      string                 `json:"type"`
	Provider  string                 `json:"provider"`
	Status    string                 `json:"status"`
	Disabled  bool                   `json:"disabled"`
	Label     string                 `json:"label"`
	IDToken   map[string]interface{} `json:"id_token"`
	ID        string                 `json:"id"`
}

func fetchAuthFiles() ([]AuthFile, error) {
	body, statusCode, err := cliProxyGet("/auth-files")
	if err != nil {
		return nil, err
	}
	if statusCode != 200 {
		return nil, fmt.Errorf("HTTP %d", statusCode)
	}

	var data struct {
		Files []AuthFile `json:"files"`
	}
	if err := json.Unmarshal(body, &data); err != nil {
		// 尝试直接解析为数组
		var files []AuthFile
		if err := json.Unmarshal(body, &files); err != nil {
			return nil, err
		}
		return files, nil
	}
	return data.Files, nil
}

func filterCodexAccounts(files []AuthFile) []AuthFile {
	var codex []AuthFile
	for _, f := range files {
		if f.Type == "codex" || f.Provider == "codex" {
			codex = append(codex, f)
		}
	}
	return codex
}

// GET /api/codex/accounts
func handleGetCodexAccounts(c *gin.Context) {
	files, err := fetchAuthFiles()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	codex := filterCodexAccounts(files)
	result := make([]gin.H, 0, len(codex))
	for _, a := range codex {
		email := a.Email
		if email == "" {
			email = a.Account
		}
		var planType interface{}
		if a.IDToken != nil {
			planType = a.IDToken["plan_type"]
		}
		result = append(result, gin.H{
			"email":     email,
			"authIndex": a.AuthIndex,
			"status":    a.Status,
			"disabled":  a.Disabled,
			"planType":  planType,
			"label":     a.Label,
		})
	}
	c.JSON(http.StatusOK, result)
}

// probeCodexAccount 检查单个 CodeX 账号有效性
func probeCodexAccount(authIndex string, chatgptAccountId string) map[string]interface{} {
	userAgent := "codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal"
	header := map[string]string{
		"Authorization": "Bearer $TOKEN$",
		"Content-Type":  "application/json",
		"User-Agent":    userAgent,
	}
	if chatgptAccountId != "" {
		header["Chatgpt-Account-Id"] = chatgptAccountId
	}

	payload := map[string]interface{}{
		"authIndex": authIndex,
		"method":    "GET",
		"url":       "https://chatgpt.com/backend-api/wham/usage",
		"header":    header,
	}

	respBody, _, err := cliProxyRequest("POST", "/api-call", payload)
	if err != nil {
		return map[string]interface{}{"valid": false, "error": err.Error()}
	}

	var data map[string]interface{}
	if err := json.Unmarshal(respBody, &data); err != nil {
		return map[string]interface{}{"valid": false, "error": "parse error"}
	}

	statusCode := int(toInt64(data["status_code"]))
	if statusCode == 0 {
		statusCode = int(toInt64(data["statusCode"]))
	}

	if statusCode == 401 {
		return map[string]interface{}{"valid": false, "statusCode": statusCode, "error": "unauthorized"}
	}
	if statusCode >= 200 && statusCode < 300 {
		return map[string]interface{}{"valid": true, "statusCode": statusCode}
	}
	return map[string]interface{}{"valid": false, "statusCode": statusCode, "error": fmt.Sprintf("status %d", statusCode)}
}

// POST /api/codex/check
func handleCodexCheck(c *gin.Context) {
	files, err := fetchAuthFiles()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	codexAccounts := filterCodexAccounts(files)
	var (
		valid, invalid int
		invalidAccounts []gin.H
		mu              sync.Mutex
	)

	// 并发检查（限制并发数）
	concurrency := 20
	sem := make(chan struct{}, concurrency)
	var wg sync.WaitGroup

	for _, account := range codexAccounts {
		if account.AuthIndex == "" {
			mu.Lock()
			invalid++
			mu.Unlock()
			continue
		}

		wg.Add(1)
		sem <- struct{}{}
		go func(acc AuthFile) {
			defer wg.Done()
			defer func() { <-sem }()

			var chatgptAccountId string
			if acc.IDToken != nil {
				if id, ok := acc.IDToken["chatgpt_account_id"].(string); ok {
					chatgptAccountId = id
				}
			}

			result := probeCodexAccount(acc.AuthIndex, chatgptAccountId)
			mu.Lock()
			defer mu.Unlock()

			if v, ok := result["valid"].(bool); ok && v {
				valid++
			} else {
				invalid++
				email := acc.Email
				if email == "" {
					email = acc.Account
				}
				name := acc.Name
				if name == "" {
					name = acc.ID
				}
				invalidAccounts = append(invalidAccounts, gin.H{
					"email": email,
					"name":  name,
					"error": result["error"],
				})
			}
		}(account)
	}

	wg.Wait()
	c.JSON(http.StatusOK, gin.H{
		"valid":           valid,
		"invalid":         invalid,
		"total":           len(codexAccounts),
		"invalidAccounts": invalidAccounts,
	})
}

// probeCodexQuota 检查单个 CodeX 账号配额
func probeCodexQuota(authIndex string, chatgptAccountId string) map[string]interface{} {
	userAgent := "codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal"
	header := map[string]string{
		"Authorization": "Bearer $TOKEN$",
		"Content-Type":  "application/json",
		"User-Agent":    userAgent,
	}
	if chatgptAccountId != "" {
		header["Chatgpt-Account-Id"] = chatgptAccountId
	}

	payload := map[string]interface{}{
		"auth_index": authIndex,
		"method":     "GET",
		"url":        "https://chatgpt.com/backend-api/wham/usage",
		"header":     header,
	}

	respBody, _, err := cliProxyRequest("POST", "/api-call", payload)
	if err != nil {
		return map[string]interface{}{"error": err.Error()}
	}

	var data map[string]interface{}
	if err := json.Unmarshal(respBody, &data); err != nil {
		return map[string]interface{}{"error": "parse error"}
	}

	statusCode := int(toInt64(data["status_code"]))
	if statusCode == 0 {
		statusCode = int(toInt64(data["statusCode"]))
	}

	if statusCode == 401 {
		return map[string]interface{}{"error": "unauthorized", "statusCode": statusCode}
	}

	// 解析 body 中的配额信息
	bodyRaw := data["body"]
	if bodyRaw == nil {
		bodyRaw = data["response_body"]
	}

	if bodyRaw != nil {
		var usageData map[string]interface{}
		switch b := bodyRaw.(type) {
		case string:
			json.Unmarshal([]byte(b), &usageData)
		case map[string]interface{}:
			usageData = b
		}

		if usageData != nil {
			if rateLimit, ok := usageData["rate_limit"].(map[string]interface{}); ok {
				if primaryWindow, ok := rateLimit["primary_window"].(map[string]interface{}); ok {
					usedPercent := primaryWindow["used_percent"]
					usedPct := 0.0
					if up, ok := usedPercent.(float64); ok {
						usedPct = up
					}
					remainingPercent := 100 - usedPct
					if remainingPercent < 0 {
						remainingPercent = 0
					}
					if remainingPercent > 100 {
						remainingPercent = 100
					}

					return map[string]interface{}{
						"completionQuota": remainingPercent,
						"usedPercent":     usedPct,
						"resetAt":         primaryWindow["reset_at"],
						"statusCode":      statusCode,
					}
				}
			}
		}
	}

	return map[string]interface{}{"statusCode": statusCode, "error": "no quota data"}
}

// POST /api/codex/quota
func handleCodexQuota(c *gin.Context) {
	var req struct {
		AuthIndexes []string `json:"authIndexes"`
	}
	c.ShouldBindJSON(&req)

	files, err := fetchAuthFiles()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	codexAccounts := filterCodexAccounts(files)

	// 如果指定了 authIndexes，过滤
	if len(req.AuthIndexes) > 0 {
		indexSet := map[string]bool{}
		for _, idx := range req.AuthIndexes {
			indexSet[idx] = true
		}
		var filtered []AuthFile
		for _, a := range codexAccounts {
			if indexSet[a.AuthIndex] {
				filtered = append(filtered, a)
			}
		}
		codexAccounts = filtered
	}

	var (
		quotas []gin.H
		mu     sync.Mutex
	)

	concurrency := 20
	sem := make(chan struct{}, concurrency)
	var wg sync.WaitGroup

	for _, account := range codexAccounts {
		if account.AuthIndex == "" {
			continue
		}

		wg.Add(1)
		sem <- struct{}{}
		go func(acc AuthFile) {
			defer wg.Done()
			defer func() { <-sem }()

			var chatgptAccountId string
			if acc.IDToken != nil {
				if id, ok := acc.IDToken["chatgpt_account_id"].(string); ok {
					chatgptAccountId = id
				}
			}

			result := probeCodexQuota(acc.AuthIndex, chatgptAccountId)
			if cq, ok := result["completionQuota"]; ok {
				email := acc.Email
				if email == "" {
					email = acc.Account
				}
				mu.Lock()
				quotas = append(quotas, gin.H{
					"authIndex":       acc.AuthIndex,
					"email":           email,
					"completionQuota": cq,
					"usedPercent":     result["usedPercent"],
					"resetAt":         result["resetAt"],
				})
				mu.Unlock()
			}
		}(account)
	}

	wg.Wait()
	if quotas == nil {
		quotas = []gin.H{}
	}
	c.JSON(http.StatusOK, gin.H{
		"total":   len(codexAccounts),
		"checked": len(quotas),
		"quotas":  quotas,
	})
}

// POST /api/codex/delete-by-auth
func handleCodexDeleteByAuth(c *gin.Context) {
	var req struct {
		AuthIndexes []string `json:"authIndexes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.AuthIndexes) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "没有要删除的账号"})
		return
	}

	files, err := fetchAuthFiles()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	indexSet := map[string]bool{}
	for _, idx := range req.AuthIndexes {
		indexSet[idx] = true
	}

	var toDelete []string
	for _, f := range files {
		if indexSet[f.AuthIndex] {
			name := f.Name
			if name == "" {
				name = f.ID
			}
			if name != "" {
				toDelete = append(toDelete, name)
			}
		}
	}

	deleted, failed := deleteAuthFilesByName(toDelete)
	c.JSON(http.StatusOK, gin.H{"deleted": deleted, "failed": failed, "total": len(toDelete)})
}

// POST /api/codex/delete
func handleCodexDelete(c *gin.Context) {
	var req struct {
		Names []string `json:"names"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Names) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "没有要删除的账号"})
		return
	}

	deleted, failed := deleteAuthFilesByName(req.Names)
	c.JSON(http.StatusOK, gin.H{"deleted": deleted, "failed": failed, "total": len(req.Names)})
}

func deleteAuthFilesByName(names []string) (int, int) {
	deleted, failed := 0, 0
	for _, name := range names {
		if name == "" {
			failed++
			continue
		}
		path := "/auth-files?name=" + url.QueryEscape(name)
		_, statusCode, err := cliProxyRequest("DELETE", path, nil)
		if err != nil || statusCode != 200 {
			failed++
		} else {
			deleted++
		}
	}
	return deleted, failed
}
