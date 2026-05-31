//go:build arm64

package main

import _ "embed"

//go:embed bin/upterm-arm64
var uptermBin []byte

//go:embed bin/tmux-arm64
var tmuxBin []byte
