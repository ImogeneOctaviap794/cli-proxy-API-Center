package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sync"
	"sync/atomic"

	"github.com/gin-gonic/gin"
)

// POST /api/codex/check-stream — SSE 流式检查账号状态
func handleCodexCheckStream(c *gin.Context) {
	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming not supported"})
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	sendEvent := func(eventType string, data interface{}) {
		jsonData, _ := json.Marshal(data)
		fmt.Fprintf(c.Writer, "event: %s\ndata: %s\n\n", eventType, jsonData)
		flusher.Flush()
	}

	files, err := fetchAuthFiles()
	if err != nil {
		sendEvent("error", map[string]string{"error": err.Error()})
		return
	}

	codexAccounts := filterCodexAccounts(files)
	total := len(codexAccounts)

	sendEvent("start", map[string]interface{}{
		"total": total,
	})

	if total == 0 {
		sendEvent("done", map[string]interface{}{
			"valid": 0, "invalid": 0, "total": 0, "invalidAccounts": []interface{}{},
		})
		return
	}

	var (
		validCount   int64
		invalidCount int64
		checked      int64
		invalidAccounts []map[string]interface{}
		mu              sync.Mutex
	)

	concurrency := 20
	sem := make(chan struct{}, concurrency)
	var wg sync.WaitGroup

	for _, account := range codexAccounts {
		if account.AuthIndex == "" {
			atomic.AddInt64(&invalidCount, 1)
			current := atomic.AddInt64(&checked, 1)
			email := account.Email
			if email == "" {
				email = account.Account
			}
			mu.Lock()
			invalidAccounts = append(invalidAccounts, map[string]interface{}{
				"email": email,
				"name":  coalesce(account.Name, account.ID),
				"error": "no auth_index",
			})
			mu.Unlock()
			sendEvent("progress", map[string]interface{}{
				"checked": current,
				"total":   total,
				"valid":   atomic.LoadInt64(&validCount),
				"invalid": atomic.LoadInt64(&invalidCount),
				"current": email,
				"status":  "invalid",
			})
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

			email := acc.Email
			if email == "" {
				email = acc.Account
			}

			if v, ok := result["valid"].(bool); ok && v {
				atomic.AddInt64(&validCount, 1)
			} else {
				atomic.AddInt64(&invalidCount, 1)
				mu.Lock()
				invalidAccounts = append(invalidAccounts, map[string]interface{}{
					"email": email,
					"name":  coalesce(acc.Name, acc.ID),
					"error": result["error"],
				})
				mu.Unlock()
			}

			current := atomic.AddInt64(&checked, 1)
			status := "valid"
			if v, ok := result["valid"].(bool); !ok || !v {
				status = "invalid"
			}

			sendEvent("progress", map[string]interface{}{
				"checked": current,
				"total":   total,
				"valid":   atomic.LoadInt64(&validCount),
				"invalid": atomic.LoadInt64(&invalidCount),
				"current": email,
				"status":  status,
			})
		}(account)
	}

	wg.Wait()

	mu.Lock()
	finalInvalid := invalidAccounts
	mu.Unlock()
	if finalInvalid == nil {
		finalInvalid = []map[string]interface{}{}
	}

	sendEvent("done", map[string]interface{}{
		"valid":           atomic.LoadInt64(&validCount),
		"invalid":         atomic.LoadInt64(&invalidCount),
		"total":           total,
		"invalidAccounts": finalInvalid,
	})
}

// POST /api/codex/delete-stream — SSE 流式删除账号
func handleCodexDeleteStream(c *gin.Context) {
	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming not supported"})
		return
	}

	var req struct {
		Names       []string `json:"names"`
		AuthIndexes []string `json:"authIndexes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 如果传了 authIndexes，先转换为 names
	toDelete := req.Names
	if len(toDelete) == 0 && len(req.AuthIndexes) > 0 {
		files, err := fetchAuthFiles()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		indexSet := map[string]bool{}
		for _, idx := range req.AuthIndexes {
			indexSet[idx] = true
		}
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
	}

	if len(toDelete) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "没有要删除的账号"})
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	sendEvent := func(eventType string, data interface{}) {
		jsonData, _ := json.Marshal(data)
		fmt.Fprintf(c.Writer, "event: %s\ndata: %s\n\n", eventType, jsonData)
		flusher.Flush()
	}

	total := len(toDelete)
	sendEvent("start", map[string]interface{}{"total": total})

	deleted, failed := 0, 0
	for i, name := range toDelete {
		if name == "" {
			failed++
			sendEvent("progress", map[string]interface{}{
				"current":  i + 1,
				"total":    total,
				"name":     name,
				"success":  false,
				"deleted":  deleted,
				"failed":   failed,
			})
			continue
		}

		path := "/auth-files?name=" + url.QueryEscape(name)
		_, statusCode, err := cliProxyRequest("DELETE", path, nil)
		if err != nil || statusCode != 200 {
			failed++
			sendEvent("progress", map[string]interface{}{
				"current": i + 1,
				"total":   total,
				"name":    name,
				"success": false,
				"deleted": deleted,
				"failed":  failed,
			})
		} else {
			deleted++
			sendEvent("progress", map[string]interface{}{
				"current": i + 1,
				"total":   total,
				"name":    name,
				"success": true,
				"deleted": deleted,
				"failed":  failed,
			})
		}
	}

	sendEvent("done", map[string]interface{}{
		"deleted": deleted,
		"failed":  failed,
		"total":   total,
	})
}
