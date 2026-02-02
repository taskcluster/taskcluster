//go:build multiuser

package main

import (
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/host"
)

func addUserToGroup(user, group string) error {
	return host.Run("/usr/sbin/dseditgroup", "-o", "edit", "-a", user, "-t", "user", group)
}

func removeUserFromGroup(user, group string) error {
	return host.Run("/usr/sbin/dseditgroup", "-o", "edit", "-d", user, "-t", "user", group)
}
