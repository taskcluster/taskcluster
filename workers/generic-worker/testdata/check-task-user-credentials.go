package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
)

// This program verifies that TASK_USER_CREDENTIALS is set correctly.
// It checks that:
// 1. TASK_USER_CREDENTIALS is set
// 2. It equals $TASK_WORKDIR/task-user-credentials.json
// 3. The file exists
func main() {
	credsPath := os.Getenv("TASK_USER_CREDENTIALS")
	if credsPath == "" {
		log.Fatal("TASK_USER_CREDENTIALS is not set")
	}

	taskWorkdir := os.Getenv("TASK_WORKDIR")
	if taskWorkdir == "" {
		log.Fatal("TASK_WORKDIR is not set")
	}

	expectedPath := filepath.Join(taskWorkdir, "task-user-credentials.json")
	if credsPath != expectedPath {
		log.Fatalf("TASK_USER_CREDENTIALS has unexpected value.\nExpected: %s\nGot: %s", expectedPath, credsPath)
	}

	// Verify the file exists
	if _, err := os.Stat(credsPath); os.IsNotExist(err) {
		log.Fatalf("Credentials file does not exist: %s", credsPath)
	}

	fmt.Printf("TASK_USER_CREDENTIALS = %s (verified)\n", credsPath)
	fmt.Println("All ok")
}
