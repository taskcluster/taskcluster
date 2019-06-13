package runtime

import (
	"fmt"
	"log"
	"os/exec"
	"strings"
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
