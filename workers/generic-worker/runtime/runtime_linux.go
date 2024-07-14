//go:build linux || freebsd

package runtime

import (
	"github.com/taskcluster/taskcluster/v67/workers/generic-worker/host"
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
		/usr/sbin/chfn -f "${username}"
		echo "${username}:${password}" | /usr/sbin/chpasswd
	`

	return host.Run("/usr/bin/env", "bash", "-c", createUserScript, user.Name, user.Password)
}

func DeleteUser(username string) (err error) {
	// We used to use `--remove-all-files` here instead of `--remove-home`.
	// This caused issues with multiuser generic-worker, and ended up
	// deleting mounts stored outside of the home directory which were
	// meant to be preserved across tasks.
	// See https://github.com/taskcluster/taskcluster/issues/7128 for
	// additional background.
	return host.Run("/usr/sbin/deluser", "--force", "--remove-home", username)
}
