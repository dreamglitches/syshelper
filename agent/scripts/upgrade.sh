#!/usr/bin/env bash
# upgrade.sh — Upgrade the syshelper agent binary in-place.
# SSH sessions survive the upgrade via the update flag + PID adoption.
#
# Usage:
#   ./upgrade.sh              — upgrade in place, detect current install type
#   ./upgrade.sh --escalate   — convert user→system install (requires root)
set -euo pipefail

GITHUB_REPO="your-org/syshelper"  # Update before release
RELEASE_TAG="latest"
BINARY_NAME="syshelper"
ESCALATE=0

[[ "${1:-}" == "--escalate" ]] && ESCALATE=1

# ── Detect current install ────────────────────────────────────────────────────
if [[ -f "/usr/bin/syshelper" ]]; then
  CURRENT_TYPE="system"
  BIN_DIR="/usr/bin"
  SERVICE_DIR="/etc/systemd/system"
  SERVICE_FLAGS=""
elif [[ -f "$HOME/.local/bin/syshelper" ]]; then
  CURRENT_TYPE="user"
  BIN_DIR="$HOME/.local/bin"
  SERVICE_DIR="$HOME/.config/systemd/user"
  SERVICE_FLAGS="--user"
else
  echo "syshelper is not installed. Run install.sh first."
  exit 1
fi

# ── Escalate: convert user → system ──────────────────────────────────────────
if [[ $ESCALATE -eq 1 ]]; then
  if [[ $EUID -ne 0 ]]; then
    echo "Error: --escalate requires root. Run with sudo."
    exit 1
  fi
  if [[ "$CURRENT_TYPE" == "system" ]]; then
    echo "Already a system install. Nothing to escalate."
    exit 0
  fi
  echo "Escalating user install → system install..."
  systemctl --user stop syshelper 2>/dev/null || true
  systemctl --user disable syshelper 2>/dev/null || true
  rm -f "$HOME/.config/systemd/user/syshelper.service"
  systemctl --user daemon-reload 2>/dev/null || true
  BIN_DIR="/usr/bin"
  SERVICE_DIR="/etc/systemd/system"
  SERVICE_FLAGS=""
  CURRENT_TYPE="system"
fi

# ── Detect architecture ───────────────────────────────────────────────────────
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)         ARCH_SUFFIX="amd64"  ;;
  aarch64|arm64)  ARCH_SUFFIX="arm64"  ;;
  armv7l|armv7)   ARCH_SUFFIX="armv7"  ;;
  armv6l|armv6)   ARCH_SUFFIX="armv6"  ;;
  i386|i686)      ARCH_SUFFIX="386"    ;;
  *)
    echo "Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

BINARY_URL="https://github.com/${GITHUB_REPO}/releases/${RELEASE_TAG}/download/${BINARY_NAME}-linux-${ARCH_SUFFIX}"

# ── Print plan ────────────────────────────────────────────────────────────────
echo ""
echo "Syshelper Upgrade"
echo "---"
echo "  Install type : $CURRENT_TYPE"
echo "  Binary       : ${BIN_DIR}/${BINARY_NAME}"
echo "  Download     : $BINARY_URL"
echo ""
read -rp "Proceed? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

# ── Download new binary ───────────────────────────────────────────────────────
TMP_BIN="$(mktemp)"
echo "Downloading ${BINARY_NAME}-linux-${ARCH_SUFFIX}..."
curl -fsSL "$BINARY_URL" -o "$TMP_BIN"
chmod 0755 "$TMP_BIN"

# ── Sanity check ──────────────────────────────────────────────────────────────
if ! "$TMP_BIN" --version &>/dev/null; then
  echo "Sanity check failed."
  rm -f "$TMP_BIN"
  exit 1
fi
echo "Sanity check passed: $("$TMP_BIN" --version)"

# ── Write update flag — tells current agent NOT to kill upterm on SIGTERM ─────
touch /tmp/.syshelper-updating
echo "Update flag set."

# ── Atomic replace ────────────────────────────────────────────────────────────
mv "$TMP_BIN" "${BIN_DIR}/${BINARY_NAME}"
echo "Binary replaced: ${BIN_DIR}/${BINARY_NAME}"

# ── Write escalated service file if needed ────────────────────────────────────
if [[ $ESCALATE -eq 1 ]]; then
  mkdir -p "$SERVICE_DIR"
  cat > "${SERVICE_DIR}/syshelper.service" <<EOF
[Unit]
Description=Syshelper Agent
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=${BIN_DIR}/${BINARY_NAME}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable syshelper
fi

# ── Restart service — new agent re-adopts live session via PID file ───────────
systemctl $SERVICE_FLAGS daemon-reload
systemctl $SERVICE_FLAGS restart syshelper

echo ""
echo "Upgrade complete. Active SSH sessions were preserved."
echo "Check status: systemctl $SERVICE_FLAGS status syshelper"
