package main

import (
	"encoding/base64"
	"os"

	"golang.org/x/crypto/ed25519"
)

func readEd25519PrivateKeyFromFile(path string) (privateKey ed25519.PrivateKey, err error) {
	base64Seed, e := os.ReadFile(path)
	if e != nil {
		return privateKey, e
	}
	seed, e := base64.StdEncoding.DecodeString(string(base64Seed))
	if e != nil {
		return privateKey, e
	}
	privateKey = ed25519.NewKeyFromSeed(seed)
	return
}
