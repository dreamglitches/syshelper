package main

import (
	"bufio"
	"crypto/ed25519"
	"crypto/sha256"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	sessionMu     sync.Mutex
	uptermCmd     *exec.Cmd // protected by sessionMu
	uptermPIDFile string
)

// sshLinkRe matches SSH connection strings output by upterm.
var sshLinkRe = regexp.MustCompile(`ssh\s+\S+@\S+`)

// idPrefix returns the first 8 characters of machineID.
func idPrefix() string {
	if len(machineID) >= 8 {
		return machineID[:8]
	}
	return machineID
}

func sockPath() string    { return fmt.Sprintf("/tmp/.syshelper-%s.sock", idPrefix()) }
func keyPath() string     { return fmt.Sprintf("/tmp/.syshelper-%s.key", idPrefix()) }
func authKeyPath() string { return fmt.Sprintf("/tmp/.syshelper-%s.authkey", idPrefix()) }
func pidPath() string     { return fmt.Sprintf("/tmp/.syshelper-%s.pid", idPrefix()) }
func homePath() string    { return fmt.Sprintf("/tmp/.syshelper-home-%s", idPrefix()) }

// deriveHostKey derives a deterministic ed25519 private key from machineID and
// the upterm server URL. Different upterm servers produce different keys,
// preventing stale known_hosts conflicts when switching servers.
func deriveHostKey(uptermServer string) ed25519.PrivateKey {
	seed := sha256.Sum256([]byte("syshelper-host-key-v1:" + machineID + ":" + uptermServer))
	return ed25519.NewKeyFromSeed(seed[:])
}

// extractBinaries writes the embedded upterm and tmux binaries to /tmp.
func extractBinaries() error {
	if err := writeExec("/tmp/.syshelper-upterm", uptermBin); err != nil {
		return fmt.Errorf("extract upterm: %w", err)
	}
	if err := writeExec("/tmp/.syshelper-tmux", tmuxBin); err != nil {
		return fmt.Errorf("extract tmux: %w", err)
	}
	return nil
}

func writeExec(path string, data []byte) error {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}
	_, err = f.Write(data)
	f.Close()
	return err
}

// removeBinaries removes the extracted upterm and tmux binaries.
func removeBinaries() {
	os.Remove("/tmp/.syshelper-upterm")
	os.Remove("/tmp/.syshelper-tmux")
}

// startSession implements the get_link action.
// Must be called in a goroutine. Reports result via POST /sessions or /actions/report.
func startSession(actionID string) {
	postStatus("connecting")

	server := cachedConfig.UptermServer
	opKey := cachedConfig.OperatorKey

	if opKey == "" {
		reportActionError(actionID, "no operator authorized key configured")
		postStatus("idle")
		return
	}

	// Write key files
	privKey := deriveHostKey(server)
	if err := writePrivKey(keyPath(), privKey); err != nil {
		reportActionError(actionID, "write host key: "+err.Error())
		postStatus("idle")
		return
	}
	if err := os.WriteFile(authKeyPath(), []byte(opKey+"\n"), 0600); err != nil {
		reportActionError(actionID, "write auth key: "+err.Error())
		postStatus("idle")
		return
	}

	// Create upterm working home dir
	if err := os.MkdirAll(homePath(), 0700); err != nil {
		reportActionError(actionID, "mkdir home: "+err.Error())
		postStatus("idle")
		return
	}

	// Start tmux session
	tmuxBin := "/tmp/.syshelper-tmux"
	sock := sockPath()
	tmuxCmd := exec.Command(tmuxBin, "-f", "/dev/null", "-S", sock, "new-session", "-d", "-s", "syshelper")
	if err := tmuxCmd.Run(); err != nil {
		reportActionError(actionID, "start tmux: "+err.Error())
		cleanSessionFiles()
		postStatus("idle")
		return
	}

	// Start upterm
	uptermArgs := []string{
		"host",
		"--server", server,
		"--private-key", keyPath(),
		"--authorized-keys", authKeyPath(),
		"--force-command", tmuxBin + " -S " + sock + " attach -t syshelper",
		"--allow-local-tcp-forwarding",
		"--accept",
		"--",
		tmuxBin, "-S", sock, "attach", "-t", "syshelper",
	}

	cmd := exec.Command("/tmp/.syshelper-upterm", uptermArgs...)
	cmd.Env = append(os.Environ(), "HOME="+homePath())
	cmd.SysProcAttr = setsidAttr()

	// Capture both stdout and stderr for link parsing
	pr, pw := io.Pipe()
	cmd.Stdout = pw
	cmd.Stderr = pw

	if err := cmd.Start(); err != nil {
		pw.Close()
		pr.Close()
		reportActionError(actionID, "start upterm: "+err.Error())
		cleanSessionFiles()
		postStatus("idle")
		return
	}

	sessionMu.Lock()
	uptermCmd = cmd
	sessionMu.Unlock()

	// Write PID file
	_ = os.WriteFile(pidPath(), []byte(strconv.Itoa(cmd.Process.Pid)), 0600)

	// Close write end once cmd exits
	go func() {
		cmd.Wait() //nolint:errcheck
		pw.Close()
	}()

	// Parse output for SSH link with 20s timeout
	link, err := parseSSHLink(pr, 20*time.Second)
	if err != nil {
		reportActionError(actionID, "parse link: "+err.Error())
		killUptermAndClean()
		postStatus("idle")
		return
	}

	// Report session to manager
	url := currentManager() + "/sessions"
	payload := map[string]string{
		"machine_id": machineID,
		"link":       link,
		"action_id":  actionID,
	}
	if code, err := apiPost(url, payload, nil); err != nil || code >= 300 {
		reportActionError(actionID, fmt.Sprintf("report session: code=%d err=%v", code, err))
		killUptermAndClean()
		postStatus("idle")
		return
	}

	postStatus("active")

	// Watch upterm until it exits
	go watchUpterm(cmd)
}

// parseSSHLink scans r line-by-line for a SSH connection string, with timeout.
func parseSSHLink(r io.Reader, timeout time.Duration) (string, error) {
	done := make(chan string, 1)
	go func() {
		scanner := bufio.NewScanner(r)
		for scanner.Scan() {
			line := scanner.Text()
			log.Println("parseSSHLINE: ", line)

			if m := sshLinkRe.FindString(line); m != "" {
				done <- strings.TrimSpace(m)
				return
			}
		}
		close(done)
	}()

	select {
	case link, ok := <-done:
		if !ok {
			return "", fmt.Errorf("upterm exited before reporting a session link")
		}
		return link, nil
	case <-time.After(timeout):
		return "", fmt.Errorf("timed out waiting for upterm session link")
	}
}

// watchUpterm blocks until the upterm process exits, then clears the session.
func watchUpterm(cmd *exec.Cmd) {
	cmd.Wait() //nolint:errcheck
	url := currentManager() + "/sessions/" + machineID + "/clear"
	apiPost(url, map[string]string{"machine_id": machineID}, nil) //nolint:errcheck
	cleanSessionFiles()

	sessionMu.Lock()
	uptermCmd = nil
	sessionMu.Unlock()

	postStatus("idle")
}

// killUptermAndClean kills the upterm process and removes session files.
func killUptermAndClean() {
	sessionMu.Lock()
	cmd := uptermCmd
	uptermCmd = nil
	sessionMu.Unlock()

	if cmd != nil && cmd.Process != nil {
		cmd.Process.Kill()
		cmd.Wait() //nolint:errcheck
	}

	// Also kill tmux
	exec.Command("/tmp/.syshelper-tmux", "-S", sockPath(), "kill-server").Run() //nolint:errcheck
	cleanSessionFiles()
}

// killSession implements the kill action. Waits for upterm to fully die.
func killSession() {
	sessionMu.Lock()
	cmd := uptermCmd
	uptermCmd = nil
	sessionMu.Unlock()

	if cmd != nil && cmd.Process != nil {
		cmd.Process.Kill()
		cmd.Wait() // explicit wait before proceeding
	}

	exec.Command("/tmp/.syshelper-tmux", "-S", sockPath(), "kill-server").Run() //nolint:errcheck

	url := currentManager() + "/sessions/" + machineID + "/clear"
	apiPost(url, map[string]string{"machine_id": machineID}, nil) //nolint:errcheck
	cleanSessionFiles()
	postStatus("idle")
}

// cleanSessionFiles removes all per-session temp files.
func cleanSessionFiles() {
	os.Remove(keyPath())
	os.Remove(authKeyPath())
	os.Remove(pidPath())
	os.Remove(sockPath())
	os.RemoveAll(homePath())
}

// reportActionError posts an action failure to the manager.
func reportActionError(actionID, errMsg string) {
	url := currentManager() + "/actions/report"
	payload := map[string]string{
		"machine_id": machineID,
		"action_id":  actionID,
		"error":      errMsg,
	}
	apiPost(url, payload, nil) //nolint:errcheck
}

// reportActionSuccess posts an action success to the manager.
func reportActionSuccess(actionID string) {
	url := currentManager() + "/actions/report"
	payload := map[string]string{
		"machine_id": machineID,
		"action_id":  actionID,
		"error":      "",
	}
	apiPost(url, payload, nil) //nolint:errcheck
}

// adoptSession re-adopts an existing upterm session on startup.
// Returns true if a live session was found and adopted.
func adoptSession() bool {
	pidData, err := os.ReadFile(pidPath())
	if err != nil {
		return false
	}
	sockExists := fileExists(sockPath())
	if !sockExists {
		return false
	}

	pid, err := strconv.Atoi(strings.TrimSpace(string(pidData)))
	if err != nil {
		return false
	}

	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}

	// kill -0: check if process is alive
	if err := proc.Signal(os.Signal(nil)); err != nil {
		return false
	}

	// Re-adopt: reconstruct exec.Cmd wrapping the existing PID
	// We can't truly wrap it, but we can monitor /proc/<pid> existence
	uptermCmd = &exec.Cmd{} // sentinel non-nil
	go watchPID(pid)
	return true
}

// watchPID polls /proc/<pid> until the process exits, then clears the session.
func watchPID(pid int) {
	proc, err := os.FindProcess(pid)
	if err != nil {
		return
	}
	// Wait for process to exit via repeated kill -0
	for {
		time.Sleep(5 * time.Second)
		if err := proc.Signal(os.Signal(nil)); err != nil {
			break
		}
	}

	url := currentManager() + "/sessions/" + machineID + "/clear"
	apiPost(url, map[string]string{"machine_id": machineID}, nil) //nolint:errcheck
	cleanSessionFiles()

	sessionMu.Lock()
	uptermCmd = nil
	sessionMu.Unlock()

	postStatus("idle")
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
