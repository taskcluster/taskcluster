//go:build multiuser

package main

import (
	"fmt"
	"os/user"
)

// proxyAllowedUser returns the OS user that the task's commands run as,
// which is the only user the task's taskcluster-proxy admits connections
// from.
func proxyAllowedUser(task *TaskRun) (string, error) {
	if task.Payload.Features.RunTaskAsCurrentUser {
		// Commands run as the worker's own user (see
		// RunTaskAsCurrentUserTask). This feature requires capacity 1, so
		// there is no other task on the worker for the proxy to protect
		// against.
		u, err := user.Current()
		if err != nil {
			return "", fmt.Errorf("could not determine current user: %w", err)
		}
		return u.Username, nil
	}
	return task.Context.User.Name, nil
}
