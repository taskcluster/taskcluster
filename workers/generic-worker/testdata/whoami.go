package main

import (
	"log"
	"os"
	"os/user"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
)

func main() {
	user, err := user.Current()
	if err != nil {
		log.Fatalf("Could not determine current user: %v", err)
	}
	runTasksAsCurrentUser, err := strconv.ParseBool(os.Args[1])
	if err != nil {
		log.Fatalf("Cannot parse bool argument to whoami.go to determine value of runTasksAsCurrentUser: %v", err)
	}
	username := user.Username

	if runTasksAsCurrentUser {
		expectedUsername := "root"
		if runtime.GOOS == "windows" {
			expectedUsername = `NT AUTHORITY\SYSTEM`
		}
		if username != expectedUsername {
			log.Fatalf("Running as current user, so username should be %q but is %q", expectedUsername, username)
		}
		log.Printf("All ok - running as current user, and username %q matches required value %q", username, expectedUsername)
	} else {
		// On Windows, local users have username in the form COMPUTER_NAME\USER
		if !strings.HasPrefix(filepath.Base(username), "task_") {
			log.Fatalf("Not running as current user but username does not start with `task_` (and it should): %v", username)
		}
		log.Printf("All ok - not running as current user, and username starts with `task_`: %v", username)
	}
}
