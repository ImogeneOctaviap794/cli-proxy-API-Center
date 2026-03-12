package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// GET /api/pricing
func handleGetPricing(c *gin.Context) {
	pricing := getModelPricing()
	c.JSON(http.StatusOK, pricing)
}

// POST /api/pricing
func handlePostPricing(c *gin.Context) {
	var req struct {
		Model       string  `json:"model"`
		InputPrice  float64 `json:"inputPrice"`
		OutputPrice float64 `json:"outputPrice"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Model == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "模型名称不能为空"})
		return
	}
	upsertModelPricing(req.Model, req.InputPrice, req.OutputPrice)
	pricing := getModelPricing()
	c.JSON(http.StatusOK, gin.H{"success": true, "pricing": pricing})
}

// DELETE /api/pricing/:model
func handleDeletePricing(c *gin.Context) {
	model := c.Param("model")
	deleteModelPricing(model)
	c.JSON(http.StatusOK, gin.H{"success": true})
}
