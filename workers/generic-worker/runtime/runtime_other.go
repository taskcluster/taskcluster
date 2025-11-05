//go:build linux || freebsd

package runtime

import (
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/taskcluster/taskcluster/v92/workers/generic-worker/gdm3"
)

const (
	gdm3CustomConfFile = "/etc/gdm3/custom.conf"
)

var (
	cachedInteractiveUsername string = ""
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

func WaitForLoginCompletion(timeout time.Duration, username string) (err error) {
	deadline := time.Now().Add(timeout)
	log.Print("Checking if user is logged in...")
	var interactiveUsername string
	for time.Now().Before(deadline) {
		interactiveUsername, err = InteractiveUsername()
		if err != nil {
			log.Printf("WARNING: Error checking for interactive user: %v", err)
			time.Sleep(time.Second)
			continue
		}
		if interactiveUsername != username {
			log.Printf("WARNING: user %v appears to be logged in but was expecting %v.", interactiveUsername, username)
			cachedInteractiveUsername = ""
			time.Sleep(time.Second)
			continue
		}
		return
	}
	log.Print("Timed out waiting for user login")
	if interactiveUsername == "" {
		return errors.New("no user logged in with console session")
	}
	return fmt.Errorf("interactive username %v does not match task user %v", interactiveUsername, username)

}

func InteractiveUsername() (interactiveUsername string, err error) {
	// Cache the result if successful, for both reliability and efficiency.
	// Caller is responsible for retries.  The logged in user does not
	// change during lifetime of generic-worker process, so we can cache
	// result. See
	//  https://github.com/taskcluster/taskcluster/issues/7012
	if cachedInteractiveUsername != "" {
		return cachedInteractiveUsername, nil
	}
	interactiveUsername, err = gdm3.InteractiveUsername()
	if err == nil {
		cachedInteractiveUsername = interactiveUsername
	}
	return
}

func SetAutoLogin(user *OSUser) error {
	source, err := os.ReadFile(gdm3CustomConfFile)
	if err != nil {
		return fmt.Errorf("could not read file %v to update auto login user: %v", gdm3CustomConfFile, err)
	}
	updated := gdm3.SetAutoLogin(user.Name, source)
	err = os.WriteFile(gdm3CustomConfFile, updated, 0644)
	if err != nil {
		return fmt.Errorf("error overwriting file %v: %v", gdm3CustomConfFile, err)
	}
	return nil
}
