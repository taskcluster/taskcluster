package runtime

import (
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/taskcluster/taskcluster/v94/workers/generic-worker/host"
	"github.com/taskcluster/taskcluster/v94/workers/generic-worker/kc"
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
		maxid=$(dscl . -list '/Users' 'UniqueID' | awk '{print $2}' | sort -un | tail -1)
		uid=$((maxid+1))
		/usr/bin/dscl . -create "/Users/${username}"
		/usr/bin/dscl . -create "/Users/${username}" 'UserShell' '/bin/bash'
		/usr/bin/dscl . -create "/Users/${username}" 'RealName' "${fullname}"
		/usr/bin/dscl . -create "/Users/${username}" 'UniqueID' "${uid}"
		/usr/bin/dscl . -passwd "/Users/${username}" "${password}"
		staffGID="$(dscl . -read /Groups/staff | awk '($1 == "PrimaryGroupID:") { print $2 }')"
		/usr/bin/dscl . -create "/Users/${username}" 'PrimaryGroupID' "${staffGID}"
		/usr/bin/dscl . -create "/Users/${username}" 'NFSHomeDirectory' "${homedir}"
		cp -R '/System/Library/User Template/English.lproj' "${homedir}"
		chown -R "${username}:staff" "${homedir}"
	`

	return host.Run("/usr/bin/env", "bash", "-c", createUserScript, user.Name, user.Password)
}

func DeleteUser(username string) (err error) {
	err = host.Run("/usr/bin/find", "/private/var/folders", "-user", username, "-delete")
	if err != nil {
		log.Printf("WARNING: Error when trying to delete files under /private/var/folders belonging to %v: %v", username, err)
	}
	err = host.Run("/usr/bin/env", "bash", "-c", `/usr/bin/dscl . -delete '/Users/`+username+`'`)
	if err != nil {
		return fmt.Errorf("error when trying to delete user account %v: %v", username, err)
	}
	return nil
}

func ListUserAccounts() (usernames []string, err error) {
	var out string
	out, err = host.Output("/usr/bin/dscl", ".", "-list", "/Users")
	if err != nil {
		return
	}
	for line := range strings.SplitSeq(out, "\n") {
		trimmedLine := strings.Trim(line, "\n ")
		usernames = append(usernames, trimmedLine)
	}
	return
}

func UserHomeDirectoriesParent() string {
	return "/Users"
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
		var fi os.FileInfo
		fi, err = os.Stat("/Library/Preferences/com.apple.loginwindow.plist")
		if err != nil {
			return fmt.Errorf("could not read file /Library/Preferences/com.apple.loginwindow.plist to determine when last login occurred: %v", err)
		}
		modTime := fi.ModTime()
		log.Printf("User %v logged in at %v", interactiveUsername, modTime)
		// See https://bugzilla.mozilla.org/show_bug.cgi?id=1560388#c3
		sleepUntil := modTime.Add(10 * time.Second)
		now := time.Now()
		if sleepUntil.After(now) {
			log.Printf("Sleeping until %v (10 seconds after login) due to https://bugzilla.mozilla.org/show_bug.cgi?id=1560388#c3", sleepUntil)
			time.Sleep(sleepUntil.Sub(now))
		}
		return
	}
	log.Print("Timed out waiting for user login")
	var output string
	output, err = host.Output("/usr/bin/last")
	if err != nil {
		log.Printf("Not able to execute /usr/bin/last due to %v", err)
	} else {
		log.Print(output)
	}
	if interactiveUsername == "" {
		return errors.New("no user logged in with console session")
	}
	return fmt.Errorf("interactive username %v does not match task user %v", interactiveUsername, username)
}

func InteractiveUsername() (string, error) {
	// The /usr/bin/last call is extremely expensive, and the logged in user
	// does not change during lifetime of generic-worker process, so we can
	// cache result. This has huge impact on integration test runtime (see
	// http://bugzil.la/1567632)
	if cachedInteractiveUsername != "" {
		return cachedInteractiveUsername, nil
	}
	output, err := host.Output("/usr/bin/last", "-t", "console", "-1")
	if err != nil {
		return "", err
	}
	if !strings.Contains(output, "logged in") {
		return "", fmt.Errorf("could not parse username from %q", output)
	}
	cachedInteractiveUsername = output[:strings.Index(output, " ")]
	return cachedInteractiveUsername, nil
}

func SetAutoLogin(user *OSUser) error {
	return kc.SetAutoLogin(user.Name, []byte(user.Password))
}
