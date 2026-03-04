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
	runTaskAsCurrentUser, err := strconv.ParseBool(os.Args[1])
	if err != nil {
		log.Fatalf("Cannot parse bool argument to whoami.go to determine value of runTaskAsCurrentUser: %v", err)
	}
	username := user.Username

	if runTaskAsCurrentUser {
		switch runtime.GOOS {
		case "windows":
			if user.Uid != "S-1-5-18" {
				log.Fatalf("Running as current user, so SID should be \"S-1-5-18\" but is %q", user.Uid)
			}
			log.Printf("All ok - running as current user, and SID %q matches required value \"S-1-5-18\"", user.Uid)
		default:
			if username != "root" {
				log.Fatalf("Running as current user, so username should be \"root\" but is %q", username)
			}
			log.Printf("All ok - running as current user, and username %q matches required value \"root\"", username)
		}
	} else {
		// On Windows, local users have username in the form COMPUTER_NAME\USER
		if !strings.HasPrefix(filepath.Base(username), "task_") {
			log.Fatalf("Not running as current user but username does not start with `task_` (and it should): %v", username)
		}
		log.Printf("All ok - not running as current user, and username starts with `task_`: %v", username)
	}
}
