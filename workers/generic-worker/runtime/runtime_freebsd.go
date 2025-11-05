package runtime

import (
	"github.com/taskcluster/taskcluster/v92/workers/generic-worker/host"
)

func (user *OSUser) CreateNew(okIfExists bool) (err error) {
	if okIfExists {
		panic("(*(runtime.OSUser)).CreateNew(true) not implemented on freebsd")
	}

	createUserScript := `
		set -eu
		username="${0}"
		homedir="/home/${0}"
		password="${1}"
		echo "Creating user '${username}' with home directory '${homedir}' and password '${password}'..."
		echo "${password}" | /usr/sbin/pw user add -n ${username} -d ${homedir} -m -h 0
	`

	return host.Run("/usr/bin/env", "bash", "-c", createUserScript, user.Name, user.Password)
}

func DeleteUser(username string) (err error) {
	return host.Run("/usr/sbin/pw", "user", "del", username)
}
