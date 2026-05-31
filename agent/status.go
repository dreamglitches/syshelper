package main

import (
	"fmt"
)

// postStatus sends an out-of-cycle status update to the manager.
// Returns silently on error — best-effort only.
func postStatus(status string) {
	url := currentManager() + "/status"
	payload := map[string]string{
		"machine_id": machineID,
		"status":     status,
	}
	code, err := apiPost(url, payload, nil)
	if err != nil || (code != 200 && code != 404) {
		// 404 means manager doesn't know us yet — beacon hasn't run. Ignore.
		_ = fmt.Sprintf("status post ignored: code=%d err=%v", code, err)
	}
}
