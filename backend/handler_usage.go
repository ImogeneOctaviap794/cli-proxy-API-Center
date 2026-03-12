package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// GET /api/usage
func handleGetUsage(c *gin.Context) {
	lastSync, _ := getSyncState()
	usage := getUsageStats()
	keyProviderCache := getKeyProviderCache()
	modelPricing := getModelPricing()

	c.JSON(http.StatusOK, gin.H{
		"lastExport":       lastSync,
		"usage":            usage,
		"keyProviderCache": keyProviderCache,
		"modelPricing":     modelPricing,
	})
}

// GET /api/usage/history
func handleGetUsageHistory(c *gin.Context) {
	lastSync, _ := getSyncState()
	c.JSON(http.StatusOK, gin.H{
		"exports":    []interface{}{},
		"lastExport": lastSync,
	})
}

// POST /api/usage/export-now
func handleExportNow(c *gin.Context) {
	autoExportUsage()
	lastSync, _ := getSyncState()
	usage := getUsageStats()
	usageSSE.Broadcast(map[string]interface{}{"manual": true})
	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"lastExport": lastSync,
		"usage":      usage,
	})
}

// GET /api/usage/stream (SSE)
func handleUsageStream(c *gin.Context) {
	usageSSE.ServeSSE(c.Writer, c.Request)
}
