//go:build multiuser

package worker

import (
	"github.com/taskcluster/taskcluster/v90/workers/generic-worker/host"
)

func addUserToGroup(user, group string) error {
	return host.Run("/usr/sbin/dseditgroup", "-o", "edit", "-a", taskContext.User.Name, "-t", "user", group)
}

func removeUserFromGroup(user, group string) error {
	return host.Run("/usr/sbin/dseditgroup", "-o", "edit", "-d", taskContext.User.Name, "-t", "user", group)
}
