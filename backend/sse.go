package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

type SSEBroadcaster struct {
	mu      sync.Mutex
	clients map[chan string]struct{}
}

var usageSSE = &SSEBroadcaster{
	clients: make(map[chan string]struct{}),
}

func (b *SSEBroadcaster) AddClient(ch chan string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.clients[ch] = struct{}{}
}

func (b *SSEBroadcaster) RemoveClient(ch chan string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.clients, ch)
	close(ch)
}

func (b *SSEBroadcaster) Broadcast(payload map[string]interface{}) {
	msg := map[string]interface{}{
		"type":      "usage-updated",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
	for k, v := range payload {
		msg[k] = v
	}
	data, _ := json.Marshal(msg)
	message := fmt.Sprintf("data: %s\n\n", data)

	b.mu.Lock()
	defer b.mu.Unlock()
	for ch := range b.clients {
		select {
		case ch <- message:
		default:
			// 客户端缓冲满了，跳过
		}
	}
}

// ServeSSE 处理 SSE 连接
func (b *SSEBroadcaster) ServeSSE(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	ch := make(chan string, 16)
	b.AddClient(ch)

	// 发送连接确认
	connected, _ := json.Marshal(map[string]interface{}{
		"type":      "connected",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
	fmt.Fprintf(w, "data: %s\n\n", connected)
	flusher.Flush()

	// 心跳
	heartbeat := time.NewTicker(20 * time.Second)
	defer heartbeat.Stop()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			b.RemoveClient(ch)
			return
		case msg := <-ch:
			fmt.Fprint(w, msg)
			flusher.Flush()
		case <-heartbeat.C:
			fmt.Fprint(w, ": keepalive\n\n")
			flusher.Flush()
		}
	}
}
