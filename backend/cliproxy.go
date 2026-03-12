package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

var httpClient = &http.Client{Timeout: 30 * time.Second}

// cliProxyGet 向 CLI-Proxy management API 发送 GET 请求
func cliProxyGet(path string) ([]byte, int, error) {
	cfg := getCliProxyConfig()
	if cfg == nil {
		return nil, 0, fmt.Errorf("CLI-Proxy not configured")
	}
	url := cfg.BaseUrl + path

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.ApiKey)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	return body, resp.StatusCode, err
}

// cliProxyRequest 向 CLI-Proxy management API 发送任意方法请求
func cliProxyRequest(method, path string, payload interface{}) ([]byte, int, error) {
	cfg := getCliProxyConfig()
	if cfg == nil {
		return nil, 0, fmt.Errorf("CLI-Proxy not configured")
	}
	url := cfg.BaseUrl + path

	var bodyReader io.Reader
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			return nil, 0, err
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.ApiKey)
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	return body, resp.StatusCode, err
}

// cliProxyRawRequest 发送原始 body（用于 PUT 整个列表等场景）
func cliProxyRawRequest(method, path string, rawBody []byte) ([]byte, int, error) {
	cfg := getCliProxyConfig()
	if cfg == nil {
		return nil, 0, fmt.Errorf("CLI-Proxy not configured")
	}
	url := cfg.BaseUrl + path

	req, err := http.NewRequest(method, url, bytes.NewReader(rawBody))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.ApiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	return body, resp.StatusCode, err
}
