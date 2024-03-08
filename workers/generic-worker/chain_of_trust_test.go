//go:build multiuser

package main

import (
	"testing"
)

func TestExitCodeMissingChainOfTrustKey(t *testing.T) {
	setup(t)
	config.Ed25519SigningKeyLocation = "some bad path"
	exitCode := RunWorker()
	if exitCode != MISSING_ED25519_PRIVATE_KEY {
		t.Fatalf("Was expecting exit code %v but got exit code %v", MISSING_ED25519_PRIVATE_KEY, exitCode)
	}
}
