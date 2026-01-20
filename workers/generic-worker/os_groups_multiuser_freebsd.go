//go:build multiuser

package main

import (
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/host"
)

func addUserToGroup(user, group string) error {
	// TODO copied from Linux version, need to find out what to do for FreeBSD
	return host.Run("/usr/sbin/usermod", "-aG", group, taskContext.User.Name)
}

func removeUserFromGroup(user, group string) error {
	// TODO copied from Linux version, need to find out what to do for FreeBSD
	return host.Run("/usr/bin/gpasswd", "-d", taskContext.User.Name, group)
}
