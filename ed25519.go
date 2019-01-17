package main

import (
	"bytes"
	"encoding/base64"
	"encoding/gob"
	"io"
	"io/ioutil"
	"os"

	"golang.org/x/crypto/ed25519"
)

func generateEd25519Keypair(privateKeyFile string) error {
	publicKey, privateKey, err := ed25519.GenerateKey(nil)
	if err != nil {
		return err
	}
	err = writeEd25519PrivateKeyToFile(privateKey, privateKeyFile)
	if err != nil {
		return err
	}
	err = writeEd25519PublicKeyToLog(publicKey)
	if err != nil {
		return err
	}
	return nil
}

func writeEd25519PublicKeyToLog(publicKey []byte) error {
	str := base64.StdEncoding.EncodeToString(publicKey)
	io.WriteString(os.Stdout, str)
	return nil
}

func writeEd25519PrivateKeyToFile(privateKey ed25519.PrivateKey, privateKeyFile string) error {
	seedStr := base64.StdEncoding.EncodeToString(privateKey.Seed())
	buf := &bytes.Buffer{}
	gob.NewEncoder(buf).Encode(seedStr)
	seed := buf.Bytes()
	err := ioutil.WriteFile(privateKeyFile, seed, 0400)
	if err != nil {
		return err
	}
	return nil
}

func readEd25519PrivateKeyFromFile(path string) (privateKey ed25519.PrivateKey, err error) {
	base64Seed, e := ioutil.ReadFile(path)
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
