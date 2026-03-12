package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
)

func main() {
	// 确定项目根目录（backend 的上级目录）
	execDir, _ := os.Getwd()
	baseDir := filepath.Dir(execDir)

	// 如果当前目录就是项目根（包含 data/ 或 dist/），则直接使用
	if _, err := os.Stat(filepath.Join(execDir, "data")); err == nil {
		baseDir = execDir
	}
	if _, err := os.Stat(filepath.Join(execDir, "package.json")); err == nil {
		baseDir = execDir
	}

	// 支持环境变量覆盖
	if dir := os.Getenv("CPA_BASE_DIR"); dir != "" {
		baseDir = dir
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "7940"
	}

	fmt.Printf("Base directory: %s\n", baseDir)

	// 初始化
	initDataDir(baseDir)
	initDB(baseDir)

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	// CORS
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// === API Routes ===

	// Settings
	r.GET("/api/settings", handleGetSettings)
	r.POST("/api/settings", handlePostSettings)

	// Sites (managed)
	r.GET("/api/sites", handleGetSites)
	r.POST("/api/sites", handlePostSites)
	r.PATCH("/api/sites/:siteName", handlePatchSite)
	r.DELETE("/api/sites/:siteName", handleDeleteSite)

	// Config sites (from CLI-Proxy config)
	r.GET("/api/config-sites", handleGetConfigSites)

	// Checkin
	r.GET("/api/status", handleGetStatus)
	r.POST("/api/checkin/:siteName", handlePostCheckin)
	r.DELETE("/api/checkin/:siteName", handleDeleteCheckin)

	// Config sites management (proxy to CLI-Proxy)
	r.GET("/api/config/sites", handleGetConfigSitesList)
	r.POST("/api/config/sites", handlePostConfigSite)
	r.PUT("/api/config/sites/:siteName", handlePutConfigSite)
	r.DELETE("/api/config/sites/:siteName", handleDeleteConfigSite)

	// Pricing
	r.GET("/api/pricing", handleGetPricing)
	r.POST("/api/pricing", handlePostPricing)
	r.DELETE("/api/pricing/:model", handleDeletePricing)

	// Usage
	r.GET("/api/usage", handleGetUsage)
	r.GET("/api/usage/history", handleGetUsageHistory)
	r.POST("/api/usage/export-now", handleExportNow)
	r.GET("/api/usage/stream", handleUsageStream)

	// OpenAI Providers
	r.GET("/api/openai-providers", handleGetProviders)
	r.PUT("/api/openai-providers", handlePutProviders)
	r.PATCH("/api/openai-providers", handlePatchProviders)
	r.DELETE("/api/openai-providers/:name", handleDeleteProvider)

	// CodeX
	r.GET("/api/codex/accounts", handleGetCodexAccounts)
	r.POST("/api/codex/check", handleCodexCheck)
	r.POST("/api/codex/quota", handleCodexQuota)
	r.POST("/api/codex/delete", handleCodexDelete)
	r.POST("/api/codex/delete-by-auth", handleCodexDeleteByAuth)

	// OpenCode
	r.GET("/api/opencode/config", handleGetOpenCodeConfig)
	r.PUT("/api/opencode/config", handlePutOpenCodeConfig)
	r.GET("/api/opencode/oh-my", handleGetOhMyOpenCode)
	r.PUT("/api/opencode/oh-my", handlePutOhMyOpenCode)

	// 静态文件服务（前端 dist/）
	distDir := filepath.Join(baseDir, "dist")
	if _, err := os.Stat(distDir); err == nil {
		r.Use(gin.WrapH(http.FileServer(http.Dir(distDir))))
		// SPA fallback
		r.NoRoute(func(c *gin.Context) {
			c.File(filepath.Join(distDir, "index.html"))
		})
	} else {
		r.NoRoute(func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"message": "CPA Center API is running. Build frontend with 'npm run build' to serve UI."})
		})
	}

	// 启动定时同步
	s := loadSettings()
	if s != nil {
		fmt.Printf("CLI-Proxy API: %s\n", s.CliProxyUrl)
		startUsageExportScheduler()
	} else {
		fmt.Println("未配置 CLI-Proxy，请访问页面进行初始设置")
	}

	fmt.Printf("CPA Center 服务运行在 http://localhost:%s\n", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
