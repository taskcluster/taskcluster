//go:build insecure

package process

import (
	"os"
	"testing"
)

func newShellCommand(t *testing.T, script string) *Command {
	t.Helper()
	cmd, err := NewCommand([]string{"/bin/sh", "-c", script}, t.TempDir(), os.Environ())
	if err != nil {
		t.Fatalf("could not create command: %v", err)
	}
	return cmd
}
