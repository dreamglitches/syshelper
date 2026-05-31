//go:build arm && !arm6

package main

import _ "embed"

//go:embed bin/upterm-armv7
var uptermBin []byte

//go:embed bin/tmux-armv7
var tmuxBin []byte
