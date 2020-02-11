package main

import (
	"io/ioutil"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRenameCrossDevice(t *testing.T) {
	if os.Getenv("GW_SKIP_Z_DRIVE_TESTS") != "" {
		t.Skip("Skipping since env var GW_SKIP_Z_DRIVE_TESTS env var is set")
	}
	exists, err := exists("Z:\\")
	if err != nil {
		t.Fatal("Problem scanning for Z: drive")
	}
	if !exists {
		t.Fatal("Z: drive does not exist on this environment")
	}
	if strings.HasPrefix(cwd, "Z:\\") {
		t.Fatal("Current directory is already on Z: so rename would not be cross device (Z: -> Z:)")
	}
	err = os.MkdirAll("Z:\\a\\b", 0700)
	if err != nil {
		t.Fatal("Could not create directory Z:\\a\\b")
	}
	randomFile := "Z:\\a\\b\\randomFile.txt"
	err = ioutil.WriteFile(randomFile, []byte("some content"), 0600)
	if err != nil {
		t.Fatalf("Hit error creating %v: %v", randomFile, err)
	}
	sourceDir := "Z:\\a"
	targetDir := filepath.Join(cwd, "a")
	err = RenameCrossDevice(sourceDir, targetDir)
	if err != nil {
		t.Fatalf("Hit error renaming folder %v as %v:\n%v", sourceDir, targetDir, err)
	}
	err = os.RemoveAll(targetDir)
	if err != nil {
		t.Fatalf("Could not clean up after test - not able to remove folder %v: %v", targetDir, err)
	}
}

func exists(path string) (bool, error) {
	_, err := os.Stat(path)
	if err == nil {
		return true, nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return true, err
}
