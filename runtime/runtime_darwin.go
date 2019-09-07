package runtime

import (
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/taskcluster/generic-worker/host"
	"github.com/taskcluster/generic-worker/kc"
)

var cachedInteractiveUsername string = ""

func (user *OSUser) CreateNew(okIfExists bool) (err error) {
	if okIfExists {
		panic("(*(runtime.OSUser)).CreateNew(true) not implemented on darwin")
	}

	createUserScript := `
		set -eu
		username="${0}"
		homedir="/Users/${0}"
		fullname="${0}"
		password="${1}"
		echo "Creating user '${username}' with home directory '${homedir}' and password '${password}'..."
		/usr/bin/sudo dscl . -create "/Users/${username}"
		/usr/bin/sudo dscl . -create "/Users/${username}" 'UserShell' '/bin/bash'
		/usr/bin/sudo dscl . -create "/Users/${username}" 'RealName' "${fullname}"
		/usr/bin/sudo dscl . -create "/Users/${username}" 'UniqueID' "${uid}"
		/usr/bin/sudo dscl . -passwd "/Users/${username}" "${password}"
		staffGID="$(dscl . -read /Groups/staff | awk '($1 == "PrimaryGroupID:") { print $2 }')"
		/usr/bin/sudo dscl . -create "/Users/${username}" 'PrimaryGroupID' "${staffGID}"
		/usr/bin/sudo dscl . -create "/Users/${username}" 'NFSHomeDirectory' "${homedir}"
		/usr/bin/sudo cp -R '/System/Library/User Template/English.lproj' "${homedir}"
		/usr/bin/sudo chown -R "${username}:staff" "${homedir}"
	`

	return host.Run("/bin/bash", "-c", createUserScript, user.Name, user.Password)
}

func DeleteUser(username string) (err error) {
	err = host.Run("/bin/bash", "-c", `/usr/bin/sudo dscl . -delete '/Users/`+username+`'`)
	if err != nil {
		return fmt.Errorf("Error when trying to delete user account %v: %v", username, err)
	}
	return nil
}

func ListUserAccounts() (usernames []string, err error) {
	var out string
	out, err = host.CombinedOutput("/usr/bin/dscl", ".", "-list", "/Users")
	if err != nil {
		return
	}
	for _, line := range strings.Split(out, "\n") {
		trimmedLine := strings.Trim(line, "\n ")
		usernames = append(usernames, trimmedLine)
	}
	return
}

func UserHomeDirectoriesParent() string {
	return "/Users"
}

func WaitForLoginCompletion(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	log.Print("Checking if user is logged in...")
	for time.Now().Before(deadline) {
		username, err := InteractiveUsername()
		if err != nil {
			log.Printf("WARNING: Error checking for interactive user: %v", err)
			time.Sleep(time.Second)
			continue
		}
		fi, err := os.Stat("/Library/Preferences/com.apple.loginwindow.plist")
		if err != nil {
			return fmt.Errorf("Could not read file /Library/Preferences/com.apple.loginwindow.plist to determine when last login occurred: %v", err)
		}
		modTime := fi.ModTime()
		log.Printf("User %v logged in at %v", username, modTime)
		// See https://bugzilla.mozilla.org/show_bug.cgi?id=1560388#c3
		sleepUntil := modTime.Add(10 * time.Second)
		now := time.Now()
		if sleepUntil.After(now) {
			log.Printf("Sleeping until %v (10 seconds after login) due to https://bugzilla.mozilla.org/show_bug.cgi?id=1560388#c3", sleepUntil)
			time.Sleep(sleepUntil.Sub(now))
		}
		return nil
	}
	log.Print("Timed out waiting for user login")
	return errors.New("No user logged in with console session")
}

func InteractiveUsername() (string, error) {
	// The /usr/bin/last call is extremely expensive, and the logged in user
	// does not change during lifetime of generic-worker process, so we can
	// cache result. This has huge impact on integration test runtime (see
	// http://bugzil.la/1567632)
	if cachedInteractiveUsername != "" {
		return cachedInteractiveUsername, nil
	}
	output, err := host.CombinedOutput("/usr/bin/last", "-t", "console", "-1")
	if err != nil {
		return "", err
	}
	if !strings.Contains(output, "logged in") {
		return "", fmt.Errorf("Could not parse username from %q", output)
	}
	cachedInteractiveUsername = output[:strings.Index(output, " ")]
	return cachedInteractiveUsername, nil
}

func AutoLogonUser() (username string) {
	var err error
	username, err = kc.AutoLoginUsername()
	if err != nil {
		log.Print("Error fetching auto-logon username: " + err.Error())
	}
	return
}

func SetAutoLogin(user *OSUser) error {
	return kc.SetAutoLogin(user.Name, []byte(user.Password))
}
