package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
)

// GET /api/opencode/config
func handleGetOpenCodeConfig(c *gin.Context) {
	s := loadSettings()
	if s == nil || s.OpenCodeConfigPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未配置 OpenCode 路径"})
		return
	}
	filePath := filepath.Join(s.OpenCodeConfigPath, "opencode.json")
	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "配置文件不存在: " + filePath})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "读取配置失败: " + err.Error()})
		}
		return
	}
	var config interface{}
	json.Unmarshal(data, &config)
	c.JSON(http.StatusOK, config)
}

// PUT /api/opencode/config
func handlePutOpenCodeConfig(c *gin.Context) {
	s := loadSettings()
	if s == nil || s.OpenCodeConfigPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未配置 OpenCode 路径"})
		return
	}
	filePath := filepath.Join(s.OpenCodeConfigPath, "opencode.json")

	var body interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	data, _ := json.MarshalIndent(body, "", "  ")
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存配置失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// GET /api/opencode/oh-my
func handleGetOhMyOpenCode(c *gin.Context) {
	s := loadSettings()
	if s == nil || s.OpenCodeConfigPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未配置 OpenCode 路径"})
		return
	}
	filePath := filepath.Join(s.OpenCodeConfigPath, "oh-my-opencode.json")
	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "配置文件不存在: " + filePath})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "读取配置失败: " + err.Error()})
		}
		return
	}
	var config interface{}
	json.Unmarshal(data, &config)
	c.JSON(http.StatusOK, config)
}

// PUT /api/opencode/oh-my
func handlePutOhMyOpenCode(c *gin.Context) {
	s := loadSettings()
	if s == nil || s.OpenCodeConfigPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未配置 OpenCode 路径"})
		return
	}
	filePath := filepath.Join(s.OpenCodeConfigPath, "oh-my-opencode.json")

	var body interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	data, _ := json.MarshalIndent(body, "", "  ")
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存配置失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
