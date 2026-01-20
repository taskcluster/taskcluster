package runtime

import (
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/host"
)

func (user *OSUser) CreateNew(okIfExists bool) (err error) {
	if okIfExists {
		panic("(*(runtime.OSUser)).CreateNew(true) not implemented on linux")
	}

	createUserScript := `
		set -eu
		username="${0}"
		homedir="/home/${0}"
		password="${1}"
		echo "Creating user '${username}' with home directory '${homedir}' and password '${password}'..."
		/usr/sbin/useradd -m -d "${homedir}" "${username}"
		/usr/bin/chfn -f "${username}"
		echo "${username}:${password}" | /usr/sbin/chpasswd
	`

	return host.Run("/usr/bin/env", "bash", "-c", createUserScript, user.Name, user.Password)
}

func DeleteUser(username string) (err error) {
	return host.Run("/usr/sbin/userdel", "--force", "-r", username)
}
