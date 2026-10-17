//go:build multiuser && (darwin || linux || freebsd)

package process

import (
	"os"
	"testing"
)

// newShellCommand creates a command that runs as the current user.
func newShellCommand(t *testing.T, script string) *Command {
	t.Helper()
	cmd, err := NewCommand([]string{"/bin/sh", "-c", script}, t.TempDir(), os.Environ(), &PlatformData{})
	if err != nil {
		t.Fatalf("could not create command: %v", err)
	}
	return cmd
}
