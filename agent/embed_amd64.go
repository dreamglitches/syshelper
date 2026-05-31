//go:build amd64

package main

import _ "embed"

//go:embed bin/upterm-amd64
var uptermBin []byte

//go:embed bin/tmux-amd64
var tmuxBin []byte
