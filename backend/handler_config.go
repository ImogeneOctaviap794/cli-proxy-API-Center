package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"

	"github.com/gin-gonic/gin"
)

// GET /api/config/sites
func handleGetConfigSitesList(c *gin.Context) {
	body, statusCode, err := cliProxyGet("/openai-compatibility")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取配置失败: " + err.Error()})
		return
	}
	if statusCode != 200 {
		c.JSON(statusCode, gin.H{"error": "获取站点列表失败"})
		return
	}

	sites := parseSitesList(body)
	c.JSON(http.StatusOK, sites)
}

func parseSitesList(body []byte) []interface{} {
	var data map[string]interface{}
	if err := json.Unmarshal(body, &data); err != nil {
		var arr []interface{}
		if err := json.Unmarshal(body, &arr); err == nil {
			return arr
		}
		return []interface{}{}
	}

	if s, ok := data["openai-compatibility"].([]interface{}); ok {
		return s
	}
	if s, ok := data["items"].([]interface{}); ok {
		return s
	}
	if s, ok := data["data"].([]interface{}); ok {
		return s
	}
	return []interface{}{}
}

// POST /api/config/sites
func handlePostConfigSite(c *gin.Context) {
	var newSite map[string]interface{}
	if err := c.ShouldBindJSON(&newSite); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if newSite["name"] == nil || newSite["base-url"] == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "站点名称和地址不能为空"})
		return
	}

	// 获取现有列表
	body, statusCode, err := cliProxyGet("/openai-compatibility")
	if err != nil || statusCode != 200 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取站点列表失败"})
		return
	}
	siteList := parseSitesList(body)

	// 检查重名
	for _, s := range siteList {
		if m, ok := s.(map[string]interface{}); ok {
			if m["name"] == newSite["name"] {
				c.JSON(http.StatusBadRequest, gin.H{"error": "站点名称已存在"})
				return
			}
		}
	}

	// 构建站点条目
	siteEntry := map[string]interface{}{
		"name":            newSite["name"],
		"base-url":        newSite["base-url"],
		"api-key-entries": newSite["api-key-entries"],
		"models":          newSite["models"],
	}
	if siteEntry["api-key-entries"] == nil {
		siteEntry["api-key-entries"] = []map[string]interface{}{{"api-key": ""}}
	}
	if siteEntry["models"] == nil {
		siteEntry["models"] = []interface{}{}
	}

	siteList = append(siteList, siteEntry)

	// 保存
	listData, _ := json.Marshal(siteList)
	_, putStatus, putErr := cliProxyRawRequest("PUT", "/openai-compatibility", listData)
	if putErr != nil || putStatus != 200 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "添加站点失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "site": siteEntry})
}

// PUT /api/config/sites/:siteName
func handlePutConfigSite(c *gin.Context) {
	siteName := c.Param("siteName")
	var updates map[string]interface{}
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	body, statusCode, err := cliProxyGet("/openai-compatibility")
	if err != nil || statusCode != 200 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取站点列表失败"})
		return
	}
	siteList := parseSitesList(body)

	siteIndex := -1
	for i, s := range siteList {
		if m, ok := s.(map[string]interface{}); ok {
			if toString(m["name"]) == siteName {
				siteIndex = i
				break
			}
		}
	}
	if siteIndex == -1 {
		c.JSON(http.StatusNotFound, gin.H{"error": "站点不存在"})
		return
	}

	site := siteList[siteIndex].(map[string]interface{})
	for _, key := range []string{"name", "base-url", "api-key-entries", "models"} {
		if v, ok := updates[key]; ok {
			site[key] = v
		}
	}

	listData, _ := json.Marshal(siteList)
	_, putStatus, putErr := cliProxyRawRequest("PUT", "/openai-compatibility", listData)
	if putErr != nil || putStatus != 200 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新站点失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "site": site})
}

// DELETE /api/config/sites/:siteName
func handleDeleteConfigSite(c *gin.Context) {
	siteName := c.Param("siteName")
	path := "/openai-compatibility?name=" + url.QueryEscape(siteName)
	_, delStatus, delErr := cliProxyRequest("DELETE", path, nil)
	if delErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除站点失败: " + delErr.Error()})
		return
	}
	if delStatus != 200 {
		c.JSON(delStatus, gin.H{"error": "删除站点失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// readBody 读取请求体为 []byte（用于透传）
func readBody(c *gin.Context) ([]byte, error) {
	return io.ReadAll(c.Request.Body)
}
