package main

import (
	"encoding/json"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
)

type ManagedSite struct {
	Name      string `json:"name"`
	BaseUrl   string `json:"baseUrl"`
	DirectUrl string `json:"directUrl,omitempty"`
}

type CheckinStatus struct {
	Date     string                    `json:"date"`
	Checkins map[string]CheckinDetails `json:"checkins"`
}

type CheckinDetails struct {
	Time string `json:"time"`
	Done bool   `json:"done"`
}

func getTodayDate() string {
	return time.Now().Format("2006-01-02")
}

func loadCheckinStatus() CheckinStatus {
	data, err := os.ReadFile(statusFile)
	if err != nil {
		return CheckinStatus{Date: getTodayDate(), Checkins: map[string]CheckinDetails{}}
	}
	var status CheckinStatus
	if err := json.Unmarshal(data, &status); err != nil {
		return CheckinStatus{Date: getTodayDate(), Checkins: map[string]CheckinDetails{}}
	}
	if status.Date != getTodayDate() {
		return CheckinStatus{Date: getTodayDate(), Checkins: map[string]CheckinDetails{}}
	}
	if status.Checkins == nil {
		status.Checkins = map[string]CheckinDetails{}
	}
	return status
}

func saveCheckinStatus(status CheckinStatus) {
	data, _ := json.MarshalIndent(status, "", "  ")
	os.WriteFile(statusFile, data, 0644)
}

func loadManagedSites() []ManagedSite {
	data, err := os.ReadFile(sitesFile)
	if err != nil {
		return []ManagedSite{}
	}
	var sites []ManagedSite
	if err := json.Unmarshal(data, &sites); err != nil {
		return []ManagedSite{}
	}
	return sites
}

func saveManagedSites(sites []ManagedSite) {
	data, _ := json.MarshalIndent(sites, "", "  ")
	os.WriteFile(sitesFile, data, 0644)
}

// GET /api/sites
func handleGetSites(c *gin.Context) {
	sites := loadManagedSites()
	status := loadCheckinStatus()
	result := make([]gin.H, 0, len(sites))
	for _, site := range sites {
		_, checked := status.Checkins[site.Name]
		result = append(result, gin.H{
			"name":      site.Name,
			"baseUrl":   site.BaseUrl,
			"directUrl": site.DirectUrl,
			"checkedIn": checked,
		})
	}
	c.JSON(http.StatusOK, result)
}

// GET /api/config-sites
func handleGetConfigSites(c *gin.Context) {
	body, statusCode, err := cliProxyGet("/openai-compatibility")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if statusCode != 200 {
		c.JSON(statusCode, gin.H{"error": "获取站点列表失败"})
		return
	}

	configSites := parseConfigSites(body)
	managedSites := loadManagedSites()
	managedNames := map[string]bool{}
	for _, s := range managedSites {
		managedNames[s.Name] = true
	}

	result := make([]gin.H, 0, len(configSites))
	for _, site := range configSites {
		result = append(result, gin.H{
			"name":    site["name"],
			"baseUrl": site["baseUrl"],
			"added":   managedNames[toString(site["name"])],
		})
	}
	c.JSON(http.StatusOK, result)
}

func parseConfigSites(body []byte) []map[string]interface{} {
	var data map[string]interface{}
	if err := json.Unmarshal(body, &data); err != nil {
		// 尝试直接解析为数组
		var arr []map[string]interface{}
		if err := json.Unmarshal(body, &arr); err == nil {
			result := make([]map[string]interface{}, 0, len(arr))
			for _, s := range arr {
				result = append(result, map[string]interface{}{
					"name":    s["name"],
					"baseUrl": s["base-url"],
				})
			}
			return result
		}
		return nil
	}

	// 尝试多种格式
	var sites []interface{}
	if s, ok := data["openai-compatibility"].([]interface{}); ok {
		sites = s
	} else if s, ok := data["items"].([]interface{}); ok {
		sites = s
	} else if s, ok := data["data"].([]interface{}); ok {
		sites = s
	}

	result := make([]map[string]interface{}, 0, len(sites))
	for _, s := range sites {
		if m, ok := s.(map[string]interface{}); ok {
			result = append(result, map[string]interface{}{
				"name":    m["name"],
				"baseUrl": m["base-url"],
			})
		}
	}
	return result
}

// POST /api/sites
func handlePostSites(c *gin.Context) {
	var req struct {
		Name      string `json:"name"`
		DirectUrl string `json:"directUrl"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "站点名称不能为空"})
		return
	}

	sites := loadManagedSites()
	for _, s := range sites {
		if s.Name == req.Name {
			c.JSON(http.StatusBadRequest, gin.H{"error": "站点已存在"})
			return
		}
	}

	// 从 config 获取 baseUrl
	body, _, _ := cliProxyGet("/openai-compatibility")
	configSites := parseConfigSites(body)
	var baseUrl string
	for _, cs := range configSites {
		if toString(cs["name"]) == req.Name {
			baseUrl = toString(cs["baseUrl"])
			break
		}
	}

	sites = append(sites, ManagedSite{Name: req.Name, BaseUrl: baseUrl, DirectUrl: req.DirectUrl})
	saveManagedSites(sites)
	c.JSON(http.StatusOK, gin.H{"success": true, "site": gin.H{"name": req.Name, "baseUrl": baseUrl, "directUrl": req.DirectUrl}})
}

// PATCH /api/sites/:siteName
func handlePatchSite(c *gin.Context) {
	siteName := c.Param("siteName")
	var req struct {
		DirectUrl string `json:"directUrl"`
	}
	c.ShouldBindJSON(&req)

	sites := loadManagedSites()
	found := false
	for i, s := range sites {
		if s.Name == siteName {
			sites[i].DirectUrl = req.DirectUrl
			found = true
			break
		}
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "站点不存在"})
		return
	}
	saveManagedSites(sites)
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// DELETE /api/sites/:siteName
func handleDeleteSite(c *gin.Context) {
	siteName := c.Param("siteName")
	sites := loadManagedSites()
	newSites := make([]ManagedSite, 0, len(sites))
	for _, s := range sites {
		if s.Name != siteName {
			newSites = append(newSites, s)
		}
	}
	saveManagedSites(newSites)

	status := loadCheckinStatus()
	delete(status.Checkins, siteName)
	saveCheckinStatus(status)

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// GET /api/status
func handleGetStatus(c *gin.Context) {
	status := loadCheckinStatus()
	c.JSON(http.StatusOK, status)
}

// POST /api/checkin/:siteName
func handlePostCheckin(c *gin.Context) {
	siteName := c.Param("siteName")
	status := loadCheckinStatus()
	status.Checkins[siteName] = CheckinDetails{
		Time: time.Now().UTC().Format(time.RFC3339),
		Done: true,
	}
	saveCheckinStatus(status)
	c.JSON(http.StatusOK, gin.H{"success": true, "siteName": siteName, "checkedIn": true})
}

// DELETE /api/checkin/:siteName
func handleDeleteCheckin(c *gin.Context) {
	siteName := c.Param("siteName")
	status := loadCheckinStatus()
	delete(status.Checkins, siteName)
	saveCheckinStatus(status)
	c.JSON(http.StatusOK, gin.H{"success": true, "siteName": siteName, "checkedIn": false})
}
