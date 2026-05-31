//go:build arm && arm6

package main

import _ "embed"

//go:embed bin/upterm-armv6
var uptermBin []byte

//go:embed bin/tmux-armv6
var tmuxBin []byte
