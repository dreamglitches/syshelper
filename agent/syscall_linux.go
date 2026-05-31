//go:build linux

package main

import "syscall"

// setsidAttr returns a SysProcAttr that starts the process in a new session.
// This detaches upterm from syshelper's process group so it survives a restart.
func setsidAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{Setsid: true}
}
