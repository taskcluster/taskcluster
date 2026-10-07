package main

import (
	"path/filepath"
	"testing"
)

func TestFreeDiskSpaceUsesRequestedDirectory(t *testing.T) {
	dir := t.TempDir()
	if _, err := freeDiskSpaceBytes(dir); err != nil {
		t.Fatalf("querying an existing directory: %v", err)
	}
	if _, err := freeDiskSpaceBytes(filepath.Join(dir, "missing")); err == nil {
		t.Fatal("expected an error for a missing directory")
	}
}
