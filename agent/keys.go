package main

import (
	"crypto/ed25519"
	"encoding/binary"
	"encoding/pem"
	"os"
)

// writePrivKey serializes an ed25519 private key into the OpenSSH private key
// format (unencrypted) and writes it to path with mode 0600.
// Pure stdlib — no golang.org/x/crypto dependency.
func writePrivKey(path string, priv ed25519.PrivateKey) error {
	data := marshalOpenSSHED25519(priv)
	block := pem.EncodeToMemory(&pem.Block{
		Type:  "OPENSSH PRIVATE KEY",
		Bytes: data,
	})
	return os.WriteFile(path, block, 0600)
}

// marshalOpenSSHED25519 builds the raw bytes of an unencrypted OpenSSH
// ed25519 private key. Format reference: PROTOCOL.key in the OpenSSH source.
func marshalOpenSSHED25519(priv ed25519.PrivateKey) []byte {
	pub := priv.Public().(ed25519.PublicKey)

	// OpenSSH magic + header
	magic := []byte("openssh-key-v1\x00")

	// ciphername, kdfname, kdfoptions = "none","none",""
	cipherName := sshString("none")
	kdfName := sshString("none")
	kdfOptions := sshString("")
	numKeys := uint32Bytes(1)

	// Public key blob
	pubKeyType := sshString("ssh-ed25519")
	pubKeyData := sshString(string(pub))
	pubBlob := append(pubKeyType, pubKeyData...)
	publicKey := sshString(string(pubBlob))

	// Private key section: two identical 4-byte random check ints (use 0)
	check := uint32Bytes(0)
	privSection := append(check, check...)

	// Private key blob: type + pub + priv(64 bytes) + comment
	privSection = append(privSection, sshString("ssh-ed25519")...)
	privSection = append(privSection, sshString(string(pub))...)
	privSection = append(privSection, sshString(string(priv))...) // 64-byte seed+pub
	privSection = append(privSection, sshString("")...)           // empty comment

	// Pad to block size 8 (cipher=none uses block size 8)
	for i := 1; len(privSection)%8 != 0; i++ {
		privSection = append(privSection, byte(i))
	}

	privateKeys := sshString(string(privSection))

	var buf []byte
	buf = append(buf, magic...)
	buf = append(buf, cipherName...)
	buf = append(buf, kdfName...)
	buf = append(buf, kdfOptions...)
	buf = append(buf, numKeys...)
	buf = append(buf, publicKey...)
	buf = append(buf, privateKeys...)
	return buf
}

func sshString(s string) []byte {
	b := make([]byte, 4+len(s))
	binary.BigEndian.PutUint32(b, uint32(len(s)))
	copy(b[4:], s)
	return b
}

func uint32Bytes(v uint32) []byte {
	b := make([]byte, 4)
	binary.BigEndian.PutUint32(b, v)
	return b
}
