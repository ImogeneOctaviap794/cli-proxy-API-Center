package main

import (
	"encoding/json"
	"net/http"
	"net/url"

	"github.com/gin-gonic/gin"
)

// GET /api/openai-providers
func handleGetProviders(c *gin.Context) {
	body, statusCode, err := cliProxyGet("/openai-compatibility")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if statusCode != 200 {
		c.JSON(statusCode, gin.H{"error": "获取提供商列表失败"})
		return
	}
	list := parseSitesList(body)
	c.JSON(http.StatusOK, list)
}

// PUT /api/openai-providers
func handlePutProviders(c *gin.Context) {
	rawBody, err := readBody(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_, putStatus, putErr := cliProxyRawRequest("PUT", "/openai-compatibility", rawBody)
	if putErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": putErr.Error()})
		return
	}
	if putStatus != 200 {
		c.JSON(putStatus, gin.H{"error": "保存失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// PATCH /api/openai-providers
func handlePatchProviders(c *gin.Context) {
	var req struct {
		Index int         `json:"index"`
		Value interface{} `json:"value"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	payload, _ := json.Marshal(req)
	_, patchStatus, patchErr := cliProxyRawRequest("PATCH", "/openai-compatibility", payload)
	if patchErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": patchErr.Error()})
		return
	}
	if patchStatus != 200 {
		c.JSON(patchStatus, gin.H{"error": "更新失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// DELETE /api/openai-providers/:name
func handleDeleteProvider(c *gin.Context) {
	name := c.Param("name")
	path := "/openai-compatibility?name=" + url.QueryEscape(name)
	_, delStatus, delErr := cliProxyRequest("DELETE", path, nil)
	if delErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": delErr.Error()})
		return
	}
	if delStatus != 200 {
		c.JSON(delStatus, gin.H{"error": "删除失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
