package main

import (
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"syscall"
)

const updateFlagPath = "/tmp/.syshelper-updating"

// recoverSession checks for a live upterm session from a previous run and
// re-adopts it. Called once at startup before the beacon loop.
func recoverSession() {
	if !fileExists(pidPath()) || !fileExists(sockPath()) {
		// No session to recover — clean up any stale files
		cleanStaleFiles()
		return
	}

	if adoptSession() {
		// Live session re-adopted — beacon will report status: active
		postStatus("active")
		return
	}

	// Stale files — clean up
	cleanStaleFiles()
}

// cleanStaleFiles removes all /tmp/.syshelper-* files for this machine ID.
func cleanStaleFiles() {
	prefix := fmt.Sprintf("/tmp/.syshelper-%s", idPrefix())
	matches, _ := filepath.Glob(prefix + "*")
	for _, m := range matches {
		os.Remove(m)
	}
	os.RemoveAll(homePath())
}

// handleSignals listens for SIGTERM/SIGINT and performs orderly shutdown.
// If /tmp/.syshelper-updating exists: the agent is being upgraded — do NOT
// kill upterm or tmux, and do NOT call /sessions/clear. The new agent will
// re-adopt the session via the PID file.
func handleSignals() {
	ch := make(chan os.Signal, 1)
	signal.Notify(ch, syscall.SIGTERM, syscall.SIGINT)
	<-ch

	if fileExists(updateFlagPath) {
		// Upgrade in progress — exit cleanly without touching the session
		os.Remove(updateFlagPath)
		os.Exit(0)
	}

	// Normal shutdown: kill upterm
	sessionMu.Lock()
	cmd := uptermCmd
	uptermCmd = nil
	sessionMu.Unlock()

	if cmd != nil && cmd.Process != nil {
		cmd.Process.Kill()
		cmd.Wait() //nolint:errcheck
	}

	// Kill tmux
	exec.Command("/tmp/.syshelper-tmux", "-S", sockPath(), "kill-server").Run() //nolint:errcheck

	// Clear session on manager
	url := currentManager() + "/sessions/" + machineID + "/clear"
	apiPost(url, map[string]string{"machine_id": machineID}, nil) //nolint:errcheck

	// Remove all temp files
	cleanStaleFiles()
	removeBinaries()

	os.Exit(0)
}
