//go:build !linux

package main

import "syscall"

// setsidAttr returns nil on non-Linux platforms (no-op).
func setsidAttr() *syscall.SysProcAttr {
	return nil
}
