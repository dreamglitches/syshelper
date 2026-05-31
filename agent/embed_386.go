//go:build 386

package main

import _ "embed"

//go:embed bin/upterm-386
var uptermBin []byte

//go:embed bin/tmux-386
var tmuxBin []byte
