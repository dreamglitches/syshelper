#!/usr/bin/env bash
# uninstall.sh — Remove the syshelper agent, service, and all temp files.
set -euo pipefail

# ── Detect install type ───────────────────────────────────────────────────────
if [[ -f "/usr/bin/syshelper" ]]; then
  INSTALL_TYPE="system"
  BIN_PATH="/usr/bin/syshelper"
  SERVICE_DIR="/etc/systemd/system"
  SERVICE_FLAGS=""
elif [[ -f "$HOME/.local/bin/syshelper" ]]; then
  INSTALL_TYPE="user"
  BIN_PATH="$HOME/.local/bin/syshelper"
  SERVICE_DIR="$HOME/.config/systemd/user"
  SERVICE_FLAGS="--user"
else
  echo "syshelper does not appear to be installed."
  exit 0
fi

# ── Print plan ────────────────────────────────────────────────────────────────
echo ""
echo "Syshelper Uninstall"
echo "---"
echo "  Install type : $INSTALL_TYPE"
echo "  Binary       : $BIN_PATH"
echo "  Service file : ${SERVICE_DIR}/syshelper.service"
echo "  Temp files   : /tmp/.syshelper-*"
echo ""
read -rp "Proceed? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

# ── Stop and disable service ──────────────────────────────────────────────────
systemctl $SERVICE_FLAGS stop syshelper 2>/dev/null || true
systemctl $SERVICE_FLAGS disable syshelper 2>/dev/null || true

# ── Remove service file ───────────────────────────────────────────────────────
rm -f "${SERVICE_DIR}/syshelper.service"
systemctl $SERVICE_FLAGS daemon-reload 2>/dev/null || true

# ── Remove binary ─────────────────────────────────────────────────────────────
rm -f "$BIN_PATH"

# ── Remove all temp files ─────────────────────────────────────────────────────
rm -f /tmp/.syshelper-upterm
rm -f /tmp/.syshelper-tmux
rm -f /tmp/.syshelper-updating
rm -f /tmp/.syshelper-*.sock
rm -f /tmp/.syshelper-*.key
rm -f /tmp/.syshelper-*.authkey
rm -f /tmp/.syshelper-*.pid
rm -rf /tmp/.syshelper-home-*

# ── Disable lingering for user installs ──────────────────────────────────────
if [[ "$INSTALL_TYPE" == "user" ]]; then
  loginctl disable-linger "$(whoami)" 2>/dev/null || true
fi

echo ""
echo "Syshelper uninstalled successfully."
