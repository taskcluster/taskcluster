package runtime

import (
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"
	"time"
)

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
		maxid=$(dscl . -list '/Users' 'UniqueID' | awk '{print $2}' | sort -ug | tail -1)
		uid=$((maxid+1))
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

	out, err := exec.Command("/bin/bash", "-c", createUserScript, user.Name, user.Password).CombinedOutput()
	log.Print(string(out))
	return err
}

func DeleteUser(username string) (err error) {
	out, err := exec.Command("/bin/bash", "-c", `/usr/bin/sudo dscl . -delete '/Users/`+username+`'`).CombinedOutput()
	if err != nil {
		return fmt.Errorf("Error when trying to delete user account %v: %v: %v", username, err, string(out))
	}
	return nil
}

func ListUserAccounts() (usernames []string, err error) {
	var out []byte
	out, err = exec.Command("/usr/bin/dscl", ".", "-list", "/Users").Output()
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(out), "\n") {
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
	output, err := exec.Command("/usr/bin/last", "-t", "console", "-1").CombinedOutput()
	if err != nil {
		return "", err
	}
	if strings.Contains(string(output), "logged in") {
		return string(output)[:strings.Index(string(output), " ")], nil
	}
	return "", fmt.Errorf("Could not parse username from %q", string(output))
}
