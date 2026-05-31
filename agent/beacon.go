package main

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

// beaconConfig holds values received from the manager, refreshed every beacon.
type beaconConfig struct {
	mu          sync.RWMutex
	UptermServer string
	OperatorKey  string
}

var cachedConfig = &beaconConfig{}

func (c *beaconConfig) update(server, key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.UptermServer = server
	c.OperatorKey = key
}

// Manager selection state
var (
	managerMu         sync.Mutex
	usingFallback     bool
	consecutiveFails  int
	attemptsSinceFail int
)

func currentManager() string {
	managerMu.Lock()
	defer managerMu.Unlock()
	if usingFallback {
		return fallbackManager
	}
	return primaryManager
}

type beaconRequest struct {
	MachineID    string `json:"machine_id"`
	Hostname     string `json:"hostname"`
	Status       string `json:"status"`
	AgentVersion string `json:"agent_version"`
}

type beaconAction struct {
	ID   string `json:"id"`
	Type string `json:"type"`
}

type beaconResponse struct {
	PollInterval        int            `json:"poll_interval"`
	UptermServer        string         `json:"upterm_server"`
	OperatorAuthorizedKey string       `json:"operator_authorized_key"`
	Actions             []beaconAction `json:"actions"`
}

// runBeaconLoop runs the beacon loop indefinitely.
func runBeaconLoop(hostname string) {
	interval := 60 * time.Second // default before first successful response

	for {
		time.Sleep(interval)

		resp, err := sendBeacon(hostname)
		if err != nil {
			interval = handleBeaconFailure(interval)
			continue
		}

		// Success: reset failure tracking
		handleBeaconSuccess()

		// Update cached config
		cachedConfig.update(resp.UptermServer, resp.OperatorAuthorizedKey)

		// Dispatch pending action if any
		for _, act := range resp.Actions {
			dispatchAction(act.ID, act.Type)
		}

		interval = time.Duration(resp.PollInterval) * time.Second
	}
}

// sendBeacon sends one beacon and returns the parsed response.
func sendBeacon(hostname string) (*beaconResponse, error) {
	// Determine status
	status := "idle"
	sessionMu.Lock()
	if uptermCmd != nil {
		status = "active"
	}
	sessionMu.Unlock()

	payload := beaconRequest{
		MachineID:    machineID,
		Hostname:     hostname,
		Status:       status,
		AgentVersion: agentVersion,
	}

	// Try primary first every 5th attempt when on fallback
	manager := currentManager()
	managerMu.Lock()
	if usingFallback {
		attemptsSinceFail++
		if attemptsSinceFail%5 == 0 {
			manager = primaryManager
		}
	}
	managerMu.Unlock()

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	_ = body

	var resp beaconResponse
	code, err := apiPost(manager+"/beacon", payload, &resp)
	if err != nil {
		return nil, fmt.Errorf("beacon post: %w", err)
	}
	if code == 401 {
		return nil, fmt.Errorf("beacon: unauthorized (wrong auth token)")
	}
	if code >= 300 {
		return nil, fmt.Errorf("beacon: HTTP %d", code)
	}

	// If we just succeeded via primary while on fallback, switch back
	if manager == primaryManager {
		managerMu.Lock()
		usingFallback = false
		consecutiveFails = 0
		attemptsSinceFail = 0
		managerMu.Unlock()
	}

	return &resp, nil
}

// handleBeaconFailure updates backoff and fallback state. Returns next interval.
func handleBeaconFailure(current time.Duration) time.Duration {
	managerMu.Lock()
	defer managerMu.Unlock()

	consecutiveFails++
	if consecutiveFails >= 3 && !usingFallback {
		usingFallback = true
		attemptsSinceFail = 0
	}

	// Exponential backoff: 60 → 120 → 240 → 300 → 600 (cap)
	next := current * 2
	caps := []time.Duration{
		60 * time.Second,
		120 * time.Second,
		240 * time.Second,
		300 * time.Second,
		600 * time.Second,
	}
	max := caps[len(caps)-1]
	if next > max {
		next = max
	}
	if next < 60*time.Second {
		next = 60 * time.Second
	}
	return next
}

// handleBeaconSuccess resets failure counters (when on primary).
func handleBeaconSuccess() {
	managerMu.Lock()
	defer managerMu.Unlock()
	consecutiveFails = 0
	// usingFallback stays true until we explicitly succeed via primary
}
