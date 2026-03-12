package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func handleGetSettings(c *gin.Context) {
	s := loadSettings()
	if s == nil {
		c.JSON(http.StatusOK, gin.H{"configured": false})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"configured":         true,
		"cliProxyUrl":        s.CliProxyUrl,
		"cliProxyConfigPath": s.CliProxyConfigPath,
		"openCodeConfigPath": s.OpenCodeConfigPath,
		"syncInterval":       s.SyncInterval,
	})
}

func handlePostSettings(c *gin.Context) {
	var req struct {
		CliProxyUrl        string `json:"cliProxyUrl"`
		CliProxyKey        string `json:"cliProxyKey"`
		CliProxyConfigPath string `json:"cliProxyConfigPath"`
		OpenCodeConfigPath string `json:"openCodeConfigPath"`
		SyncInterval       *int   `json:"syncInterval"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.CliProxyUrl == "" || req.CliProxyKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "CLI-Proxy 地址和密码不能为空"})
		return
	}

	s := loadSettings()
	if s == nil {
		s = &Settings{}
	}
	s.CliProxyUrl = req.CliProxyUrl
	s.CliProxyKey = req.CliProxyKey
	s.CliProxyConfigPath = req.CliProxyConfigPath
	if req.OpenCodeConfigPath != "" {
		s.OpenCodeConfigPath = req.OpenCodeConfigPath
	}
	if req.SyncInterval != nil {
		s.SyncInterval = *req.SyncInterval
	}

	if err := saveSettings(s); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
