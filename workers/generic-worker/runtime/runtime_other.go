//go:build linux || freebsd

package runtime

import (
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/taskcluster/taskcluster/v54/workers/generic-worker/gdm3"
)

const (
	gdm3CustomConfFile = "/etc/gdm3/custom.conf"
)

func ListUserAccounts() (usernames []string, err error) {
	var passwd []byte
	passwd, err = os.ReadFile("/etc/passwd")
	if err != nil {
		return
	}
	lines := strings.Split(string(passwd), "\n")
	usernames = []string{}
	for _, line := range lines {
		if line != "" {
			usernames = append(usernames, strings.SplitN(line, ":", 2)[0])
		}
	}
	return
}

func UserHomeDirectoriesParent() string {
	return "/home"
}

func WaitForLoginCompletion(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	log.Print("Checking if user is logged in...")
	for time.Now().Before(deadline) {
		_, err := InteractiveUsername()
		if err != nil {
			log.Printf("WARNING: Error checking for interactive user: %v", err)
			time.Sleep(time.Second)
			continue
		}
		return nil
	}
	log.Print("Timed out waiting for user login")
	return errors.New("No user logged in with console session")
}

func InteractiveUsername() (string, error) {
	return gdm3.InteractiveUsername()
}

func SetAutoLogin(user *OSUser) error {
	source, err := os.ReadFile(gdm3CustomConfFile)
	if err != nil {
		return fmt.Errorf("Could not read file %v to update auto login user: %v", gdm3CustomConfFile, err)
	}
	updated := gdm3.SetAutoLogin(user.Name, source)
	err = os.WriteFile(gdm3CustomConfFile, updated, 0644)
	if err != nil {
		return fmt.Errorf("Error overwriting file %v: %v", gdm3CustomConfFile, err)
	}
	return nil
}

func AutoLogonUser() (username string) {
	source, err := os.ReadFile(gdm3CustomConfFile)
	if err != nil {
		return ""
	}
	return gdm3.AutoLogonUser(source)
}
