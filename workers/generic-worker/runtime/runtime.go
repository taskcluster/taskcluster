package runtime

import (
	"os"
	"os/user"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/dchest/uniuri"
)

// Uses [A-Za-z0-9] characters (default set) to avoid strange escaping problems
// that could potentially affect security. Prefixed with `pWd0_` to ensure
// password contains a special character (_), lowercase and uppercase letters,
// and a number. This is useful if the OS has a strict password policy
// requiring all of these. The total password length is 29 characters (24 of
// which are random). 29 characters should not be too long for the OS. The 24
// random characters of [A-Za-z0-9] provide (26+26+10)^24 possible permutations
// (approx 143 bits of randomness). Randomisation is not seeded, so results
// should not be reproducible.
func GeneratePassword() string {
	return "pWd0_" + uniuri.NewLen(24)
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

func (usr *OSUser) ID() (string, error) {
	u, err := user.Lookup(usr.Name)
	if err != nil {
		return "", err
	}
	return u.Uid, nil
}
