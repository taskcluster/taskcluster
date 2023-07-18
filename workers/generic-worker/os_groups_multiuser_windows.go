//go:build multiuser

package main

import (
	"github.com/taskcluster/taskcluster/v54/workers/generic-worker/host"
)

func addUserToGroup(user, group string) error {
	return host.Run("net", "localgroup", group, "/add", taskContext.User.Name)
}

func removeUserFromGroup(user, group string) error {
	return host.Run("net", "localgroup", group, "/delete", taskContext.User.Name)
}

func (osGroups *OSGroups) refreshTaskCommands() (err *CommandExecutionError) {
	taskContext.pd.RefreshLoginSession(taskContext.User.Name, taskContext.User.Password)
	for _, command := range osGroups.Task.Commands {
		command.SysProcAttr.Token = taskContext.pd.LoginInfo.AccessToken()
	}
	return
}
