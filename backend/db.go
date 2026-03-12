package main

import (
	"database/sql"
	"fmt"
	"log"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

var db *sql.DB

func initDB(base string) {
	dbPath := filepath.Join(base, "data", "usage.db")
	var err error
	db, err = sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}

	// 初始化表结构
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS usage_records (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			request_id TEXT UNIQUE,
			api_path TEXT NOT NULL,
			model TEXT NOT NULL,
			source TEXT,
			auth_index TEXT,
			input_tokens INTEGER DEFAULT 0,
			output_tokens INTEGER DEFAULT 0,
			total_tokens INTEGER DEFAULT 0,
			success INTEGER DEFAULT 1,
			request_time TEXT,
			created_at TEXT DEFAULT (datetime('now'))
		);

		CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_records(model);
		CREATE INDEX IF NOT EXISTS idx_usage_time ON usage_records(request_time);
		CREATE INDEX IF NOT EXISTS idx_usage_api ON usage_records(api_path);
		CREATE INDEX IF NOT EXISTS idx_usage_auth ON usage_records(auth_index);
		CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_records(date(request_time));

		CREATE TABLE IF NOT EXISTS sync_state (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			last_sync TEXT,
			last_export_at TEXT
		);

		INSERT OR IGNORE INTO sync_state (id) VALUES (1);

		CREATE TABLE IF NOT EXISTS key_provider_cache (
			cache_key TEXT PRIMARY KEY,
			provider TEXT,
			channel TEXT,
			email TEXT,
			source TEXT,
			updated_at TEXT DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS model_pricing (
			model TEXT PRIMARY KEY,
			input_price REAL DEFAULT 0,
			output_price REAL DEFAULT 0,
			updated_at TEXT DEFAULT (datetime('now'))
		);
	`)
	if err != nil {
		log.Fatalf("Failed to init tables: %v", err)
	}

	// 迁移：添加 cached_tokens 和 reasoning_tokens 列
	for _, col := range []string{"cached_tokens", "reasoning_tokens"} {
		db.Exec(fmt.Sprintf("ALTER TABLE usage_records ADD COLUMN %s INTEGER DEFAULT 0", col))
	}
}

// UsageRecord 使用记录
type UsageRecord struct {
	RequestID       string `json:"request_id"`
	ApiPath         string `json:"api_path"`
	Model           string `json:"model"`
	Source          string `json:"source"`
	AuthIndex       string `json:"auth_index"`
	InputTokens     int64  `json:"input_tokens"`
	OutputTokens    int64  `json:"output_tokens"`
	TotalTokens     int64  `json:"total_tokens"`
	CachedTokens    int64  `json:"cached_tokens"`
	ReasoningTokens int64  `json:"reasoning_tokens"`
	Success         bool   `json:"success"`
	RequestTime     string `json:"request_time"`
}

// insertUsageBatch 批量插入使用记录（事务）
func insertUsageBatch(records []UsageRecord) (int64, error) {
	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT OR IGNORE INTO usage_records 
		(request_id, api_path, model, source, auth_index, input_tokens, output_tokens, total_tokens, cached_tokens, reasoning_tokens, success, request_time)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return 0, err
	}
	defer stmt.Close()

	var inserted int64
	for _, r := range records {
		successInt := 1
		if !r.Success {
			successInt = 0
		}
		result, err := stmt.Exec(
			r.RequestID, r.ApiPath, r.Model, r.Source, r.AuthIndex,
			r.InputTokens, r.OutputTokens, r.TotalTokens, r.CachedTokens, r.ReasoningTokens,
			successInt, r.RequestTime,
		)
		if err != nil {
			continue
		}
		affected, _ := result.RowsAffected()
		inserted += affected
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return inserted, nil
}

// UsageOverview 统计概览
type UsageOverview struct {
	TotalRequests    int64 `json:"total_requests"`
	SuccessCount     int64 `json:"success_count"`
	FailureCount     int64 `json:"failure_count"`
	TotalTokens      int64 `json:"total_tokens"`
	TotalInputTokens int64 `json:"total_input_tokens"`
	TotalOutputTokens int64 `json:"total_output_tokens"`
}

func getOverview() UsageOverview {
	var o UsageOverview
	row := db.QueryRow(`
		SELECT 
			COALESCE(COUNT(*), 0),
			COALESCE(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(total_tokens), 0),
			COALESCE(SUM(input_tokens), 0),
			COALESCE(SUM(output_tokens), 0)
		FROM usage_records
	`)
	row.Scan(&o.TotalRequests, &o.SuccessCount, &o.FailureCount, &o.TotalTokens, &o.TotalInputTokens, &o.TotalOutputTokens)
	return o
}

type ModelStat struct {
	Model       string `json:"model"`
	Requests    int64  `json:"requests"`
	TotalTokens int64  `json:"total_tokens"`
	InputTokens int64  `json:"input_tokens"`
	OutputTokens int64 `json:"output_tokens"`
	LastUsed    string `json:"last_used"`
}

func getByModel() []ModelStat {
	rows, err := db.Query(`
		SELECT model, COUNT(*), COALESCE(SUM(total_tokens),0), COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0), MAX(request_time)
		FROM usage_records GROUP BY model ORDER BY SUM(total_tokens) DESC
	`)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var stats []ModelStat
	for rows.Next() {
		var s ModelStat
		var lastUsed sql.NullString
		rows.Scan(&s.Model, &s.Requests, &s.TotalTokens, &s.InputTokens, &s.OutputTokens, &lastUsed)
		if lastUsed.Valid {
			s.LastUsed = lastUsed.String
		}
		stats = append(stats, s)
	}
	return stats
}

type DayCount struct {
	Day   string `json:"day"`
	Count int64  `json:"count"`
}

func getRequestsByDay() map[string]int64 {
	rows, _ := db.Query(`
		SELECT substr(request_time, 1, 10) as day, COUNT(*) as count
		FROM usage_records WHERE request_time IS NOT NULL
		GROUP BY substr(request_time, 1, 10) ORDER BY day
	`)
	if rows == nil {
		return map[string]int64{}
	}
	defer rows.Close()

	m := map[string]int64{}
	for rows.Next() {
		var day string
		var count int64
		rows.Scan(&day, &count)
		m[day] = count
	}
	return m
}

func getRequestsByHour() map[string]int64 {
	today := time.Now().Format("2006-01-02")
	rows, _ := db.Query(`
		SELECT substr(request_time, 12, 2) as hour, COUNT(*) as count
		FROM usage_records WHERE request_time IS NOT NULL
		AND substr(request_time, 1, 10) = ? GROUP BY substr(request_time, 12, 2) ORDER BY hour
	`, today)
	if rows == nil {
		return map[string]int64{}
	}
	defer rows.Close()

	m := map[string]int64{}
	for rows.Next() {
		var hour string
		var count int64
		rows.Scan(&hour, &count)
		m[hour] = count
	}
	return m
}

func getTokensByDay() map[string]int64 {
	rows, _ := db.Query(`
		SELECT substr(request_time, 1, 10) as day, COALESCE(SUM(total_tokens),0)
		FROM usage_records WHERE request_time IS NOT NULL
		GROUP BY substr(request_time, 1, 10) ORDER BY day
	`)
	if rows == nil {
		return map[string]int64{}
	}
	defer rows.Close()

	m := map[string]int64{}
	for rows.Next() {
		var day string
		var tokens int64
		rows.Scan(&day, &tokens)
		m[day] = tokens
	}
	return m
}

func getTokensByHour() map[string]int64 {
	today := time.Now().Format("2006-01-02")
	rows, _ := db.Query(`
		SELECT substr(request_time, 12, 2) as hour, COALESCE(SUM(total_tokens),0)
		FROM usage_records WHERE request_time IS NOT NULL
		AND substr(request_time, 1, 10) = ? GROUP BY substr(request_time, 12, 2) ORDER BY hour
	`, today)
	if rows == nil {
		return map[string]int64{}
	}
	defer rows.Close()

	m := map[string]int64{}
	for rows.Next() {
		var hour string
		var tokens int64
		rows.Scan(&hour, &tokens)
		m[hour] = tokens
	}
	return m
}

type ApiModelStat struct {
	ApiPath      string `json:"api_path"`
	Model        string `json:"model"`
	Requests     int64  `json:"requests"`
	TotalTokens  int64  `json:"total_tokens"`
	InputTokens  int64  `json:"input_tokens"`
	OutputTokens int64  `json:"output_tokens"`
}

func getByApi() []ApiModelStat {
	rows, err := db.Query(`
		SELECT api_path, model, COUNT(*), COALESCE(SUM(total_tokens),0), COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0)
		FROM usage_records GROUP BY api_path, model ORDER BY COUNT(*) DESC
	`)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var stats []ApiModelStat
	for rows.Next() {
		var s ApiModelStat
		rows.Scan(&s.ApiPath, &s.Model, &s.Requests, &s.TotalTokens, &s.InputTokens, &s.OutputTokens)
		stats = append(stats, s)
	}
	return stats
}

type DetailRecord struct {
	Timestamp       string `json:"timestamp"`
	AuthIndex       string `json:"auth_index"`
	Source          string `json:"source"`
	InputTokens     int64  `json:"input_tokens"`
	OutputTokens    int64  `json:"output_tokens"`
	TotalTokens     int64  `json:"total_tokens"`
	CachedTokens    int64  `json:"cached_tokens"`
	ReasoningTokens int64  `json:"reasoning_tokens"`
	Success         int    `json:"success"`
}

func getModelDetails(apiPath, model string) []DetailRecord {
	rows, err := db.Query(`
		SELECT request_time, COALESCE(auth_index,''), COALESCE(source,''), input_tokens, output_tokens, total_tokens, 
			COALESCE(cached_tokens,0), COALESCE(reasoning_tokens,0), success
		FROM usage_records WHERE api_path = ? AND model = ?
		ORDER BY request_time DESC LIMIT 1000
	`, apiPath, model)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var details []DetailRecord
	for rows.Next() {
		var d DetailRecord
		var ts sql.NullString
		rows.Scan(&ts, &d.AuthIndex, &d.Source, &d.InputTokens, &d.OutputTokens, &d.TotalTokens, &d.CachedTokens, &d.ReasoningTokens, &d.Success)
		if ts.Valid {
			d.Timestamp = ts.String
		}
		details = append(details, d)
	}
	return details
}

// getUsageStats 获取完整的使用统计（兼容 Node.js 版本格式）
func getUsageStats() map[string]interface{} {
	overview := getOverview()
	byApi := getByApi()

	// 构建兼容旧格式的 apis 结构
	apis := map[string]interface{}{}
	for _, row := range byApi {
		apiMap, ok := apis[row.ApiPath].(map[string]interface{})
		if !ok {
			apiMap = map[string]interface{}{
				"models": map[string]interface{}{},
			}
			apis[row.ApiPath] = apiMap
		}
		models := apiMap["models"].(map[string]interface{})

		rawDetails := getModelDetails(row.ApiPath, row.Model)
		details := make([]map[string]interface{}, 0, len(rawDetails))
		for _, d := range rawDetails {
			details = append(details, map[string]interface{}{
				"timestamp":  d.Timestamp,
				"auth_index": d.AuthIndex,
				"source":     d.Source,
				"tokens": map[string]interface{}{
					"input_tokens":     d.InputTokens,
					"output_tokens":    d.OutputTokens,
					"total_tokens":     d.TotalTokens,
					"cached_tokens":    d.CachedTokens,
					"reasoning_tokens": d.ReasoningTokens,
				},
				"failed": d.Success == 0,
			})
		}

		models[row.Model] = map[string]interface{}{
			"requests":      row.Requests,
			"total_tokens":  row.TotalTokens,
			"input_tokens":  row.InputTokens,
			"output_tokens": row.OutputTokens,
			"details":       details,
		}
	}

	return map[string]interface{}{
		"total_requests":   overview.TotalRequests,
		"success_count":    overview.SuccessCount,
		"failure_count":    overview.FailureCount,
		"total_tokens":     overview.TotalTokens,
		"apis":             apis,
		"requests_by_day":  getRequestsByDay(),
		"requests_by_hour": getRequestsByHour(),
		"tokens_by_day":    getTokensByDay(),
		"tokens_by_hour":   getTokensByHour(),
	}
}

// Sync state
func getSyncState() (lastSync, lastExportAt string) {
	row := db.QueryRow("SELECT COALESCE(last_sync,''), COALESCE(last_export_at,'') FROM sync_state WHERE id = 1")
	row.Scan(&lastSync, &lastExportAt)
	return
}

func updateSyncState(lastSync, lastExportAt string) {
	db.Exec("UPDATE sync_state SET last_sync = ?, last_export_at = ? WHERE id = 1", lastSync, lastExportAt)
}

// Key-Provider cache
type KeyProviderInfo struct {
	Provider string `json:"provider"`
	Channel  string `json:"channel"`
	Email    string `json:"email"`
	Source   string `json:"source"`
}

func getKeyProviderCache() map[string]KeyProviderInfo {
	rows, err := db.Query("SELECT cache_key, COALESCE(provider,''), COALESCE(channel,''), COALESCE(email,''), COALESCE(source,'') FROM key_provider_cache")
	if err != nil {
		return map[string]KeyProviderInfo{}
	}
	defer rows.Close()

	m := map[string]KeyProviderInfo{}
	for rows.Next() {
		var key string
		var info KeyProviderInfo
		rows.Scan(&key, &info.Provider, &info.Channel, &info.Email, &info.Source)
		m[key] = info
	}
	return m
}

func upsertKeyProvider(cacheKey string, info KeyProviderInfo) {
	db.Exec(`INSERT OR REPLACE INTO key_provider_cache (cache_key, provider, channel, email, source, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
		cacheKey, info.Provider, info.Channel, info.Email, info.Source)
}

// Model pricing
type ModelPricing struct {
	InputPrice  float64 `json:"inputPrice"`
	OutputPrice float64 `json:"outputPrice"`
	UpdatedAt   string  `json:"updatedAt"`
}

func getModelPricing() map[string]ModelPricing {
	rows, err := db.Query("SELECT model, input_price, output_price, COALESCE(updated_at,'') FROM model_pricing")
	if err != nil {
		return map[string]ModelPricing{}
	}
	defer rows.Close()

	m := map[string]ModelPricing{}
	for rows.Next() {
		var model string
		var p ModelPricing
		rows.Scan(&model, &p.InputPrice, &p.OutputPrice, &p.UpdatedAt)
		m[model] = p
	}
	return m
}

func upsertModelPricing(model string, inputPrice, outputPrice float64) {
	db.Exec(`INSERT OR REPLACE INTO model_pricing (model, input_price, output_price, updated_at) VALUES (?, ?, ?, datetime('now'))`,
		model, inputPrice, outputPrice)
}

func deleteModelPricing(model string) {
	db.Exec("DELETE FROM model_pricing WHERE model = ?", model)
}

// extractUsageRecords 从 CLI-Proxy 导出数据中提取记录
func extractUsageRecords(usage map[string]interface{}) []UsageRecord {
	var records []UsageRecord
	apisRaw, ok := usage["apis"]
	if !ok {
		return records
	}
	apis, ok := apisRaw.(map[string]interface{})
	if !ok {
		return records
	}

	for apiPath, apiDataRaw := range apis {
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

		for model, modelDataRaw := range models {
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

				tokens := map[string]interface{}{}
				if t, ok := detail["tokens"].(map[string]interface{}); ok {
					tokens = t
				}

				inputTokens := toInt64(tokens["input_tokens"])
				outputTokens := toInt64(tokens["output_tokens"])
				totalTokens := toInt64(tokens["total_tokens"])
				if totalTokens == 0 {
					totalTokens = inputTokens + outputTokens
				}

				timestamp := toString(detail["timestamp"])
				source := toString(detail["source"])
				authIndex := toString(detail["auth_index"])

				requestID := fmt.Sprintf("%s:%s:%s:%s:%d:%d", apiPath, model,
					coalesce(authIndex, source, "unknown"), timestamp, inputTokens, outputTokens)

				failed, _ := detail["failed"].(bool)

				records = append(records, UsageRecord{
					RequestID:       requestID,
					ApiPath:         apiPath,
					Model:           model,
					Source:          source,
					AuthIndex:       authIndex,
					InputTokens:     inputTokens,
					OutputTokens:    outputTokens,
					TotalTokens:     totalTokens,
					CachedTokens:    toInt64(tokens["cached_tokens"]),
					ReasoningTokens: toInt64(tokens["reasoning_tokens"]),
					Success:         !failed,
					RequestTime:     timestamp,
				})
			}
		}
	}
	return records
}

func toInt64(v interface{}) int64 {
	switch n := v.(type) {
	case float64:
		return int64(n)
	case int64:
		return n
	case int:
		return int64(n)
	}
	return 0
}

func toString(v interface{}) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func coalesce(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
