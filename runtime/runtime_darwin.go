package runtime

import (
	"log"
	"os/exec"
)

func (user *OSUser) Create(okIfExists bool) error {

	createUserScript := `
		set -eu
		username="${0}"
		homedir="${1}"
		fullname="${2}"
		password="${3}"
		echo "Creating user '${username}' with home directory '${homedir}' and password '${password}'..."
		maxid=$(dscl . -list '/Users' 'UniqueID' | awk '{print $2}' | sort -ug | tail -1)
		newid=$((maxid+1))
		dscl . -create "/Users/${username}"
		dscl . -create "/Users/${username}" 'UserShell' '/bin/bash'
		dscl . -create "/Users/${username}" 'RealName' "${fullname}"
		dscl . -create "/Users/${username}" 'UniqueID' "${newid}"
		dscl . -passwd "/Users/${username}" "${password}" 
		staff="$(dscl . -read /Groups/staff | awk '($1 == "PrimaryGroupID:") { print $2 }')"
		dscl . -create "/Users/${username}" 'PrimaryGroupID' "${staff}"
		dscl . -create "/Users/${username}" 'NFSTaskDirectory' "${homedir}"
		cp -R '/System/Library/User Template/English.lproj' "${homedir}"
		chown -R "${username}:staff" "${homedir}"
		echo "User '${username}' created."
	`

	out, err := exec.Command("sudo", "/bin/bash", "-c", createUserScript, user.Name, user.HomeDir, user.Name+" User", user.Password).Output()
	log.Print(string(out))
	return err
}
