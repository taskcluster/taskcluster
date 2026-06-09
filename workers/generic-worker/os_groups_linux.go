package main

import (
	"github.com/taskcluster/taskcluster/v100/workers/generic-worker/host"
)

func addUserToGroup(user, group string) error {
	return host.Run("/usr/sbin/usermod", "-aG", group, user)
}

func removeUserFromGroup(user, group string) error {
	return host.Run("/usr/bin/gpasswd", "-d", user, group)
}
