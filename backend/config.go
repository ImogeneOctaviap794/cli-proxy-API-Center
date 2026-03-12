package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

type Settings struct {
	CliProxyUrl        string `json:"cliProxyUrl,omitempty"`
	CliProxyKey        string `json:"cliProxyKey,omitempty"`
	CliProxyConfigPath string `json:"cliProxyConfigPath,omitempty"`
	OpenCodeConfigPath string `json:"openCodeConfigPath,omitempty"`
	SyncInterval       int    `json:"syncInterval,omitempty"`
}

type CliProxyConfig struct {
	BaseUrl string
	ApiKey  string
}

var (
	dataDir      string
	settingsFile string
	statusFile   string
	sitesFile    string
	settingsMu   sync.RWMutex
)

func initDataDir(base string) {
	dataDir = filepath.Join(base, "data")
	settingsFile = filepath.Join(dataDir, "settings.json")
	statusFile = filepath.Join(dataDir, "checkin-status.json")
	sitesFile = filepath.Join(dataDir, "managed-sites.json")
	os.MkdirAll(dataDir, 0755)
}

func loadSettings() *Settings {
	settingsMu.RLock()
	defer settingsMu.RUnlock()

	data, err := os.ReadFile(settingsFile)
	if err != nil {
		return nil
	}
	var s Settings
	if err := json.Unmarshal(data, &s); err != nil {
		return nil
	}
	return &s
}

func saveSettings(s *Settings) error {
	settingsMu.Lock()
	defer settingsMu.Unlock()

	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(settingsFile, data, 0644)
}

func getCliProxyConfig() *CliProxyConfig {
	s := loadSettings()
	if s == nil {
		return nil
	}
	baseUrl := s.CliProxyUrl
	if baseUrl == "" {
		baseUrl = "http://localhost:8317"
	}
	apiKey := s.CliProxyKey
	if apiKey == "" {
		apiKey = "cli-proxy-admin"
	}
	return &CliProxyConfig{
		BaseUrl: fmt.Sprintf("%s/v0/management", baseUrl),
		ApiKey:  apiKey,
	}
}

func getSyncInterval() int {
	s := loadSettings()
	if s == nil || s.SyncInterval <= 0 {
		return 5
	}
	return s.SyncInterval
}
