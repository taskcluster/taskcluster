//go:build multiuser && (darwin || linux || freebsd)

package main

import (
	"os"
	"testing"
)

func makeFileUnreachable(t *testing.T, path string) {
	t.Helper()
	err := os.Chmod(path, 0000)
	if err != nil {
		t.Fatalf("Failed to chmod %s: %v", path, err)
	}
}
