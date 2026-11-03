package runtime

import (
	"crypto/rand"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// Uses crypto/rand.Text, which returns [A-Z2-7] characters, to avoid strange
// escaping problems that could potentially affect security. Prefixed with
// `pWd0_` to ensure password contains a special character (_), lowercase and
// uppercase letters, and a number. This is useful if the OS has a strict
// password policy requiring all of these. The total password length is at
// least 31 characters (at least 26 of which are random), which should not be
// too long for the OS. The random base32 characters provide at least 128 bits
// of randomness.
func GeneratePassword() string {
	return "pWd0_" + rand.Text()
}

func GenericWorkerBinary() string {
	// We want to run generic-worker, which is os.Args[0] if we are running generic-worker, but if
	// we are running tests, os.Args[0] will be the test executable, so then we use relative path to
	// installed binary. This hack will go if we can impersonate the logged on user.
	var exe string
	if testing.Testing() {
		exe = filepath.Join(os.Getenv("GOPATH"), "bin", "generic-worker")
		if runtime.GOOS == "windows" {
			exe += ".exe"
		}
	} else {
		exe = os.Args[0]
	}

	return exe
}
