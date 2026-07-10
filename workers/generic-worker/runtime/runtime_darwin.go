package runtime

import (
	"fmt"
	"log"
	"strings"

	"github.com/taskcluster/taskcluster/v101/workers/generic-worker/host"
	"github.com/taskcluster/taskcluster/v101/workers/generic-worker/kc"
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

func SetAutoLogin(user *OSUser) error {
	return kc.SetAutoLogin(user.Name, []byte(user.Password))
}
