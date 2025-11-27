//go:build multiuser

package main

import (
	"github.com/taskcluster/taskcluster/v94/workers/generic-worker/host"
)

func addUserToGroup(user, group string) error {
	return host.Run("powershell", "-Command", "Add-LocalGroupMember -Group '"+group+"' -Member '"+taskContext.User.Name+"'")
}

func removeUserFromGroup(user, group string) error {
	return host.Run("powershell", "-Command", "Remove-LocalGroupMember -Group '"+group+"' -Member '"+taskContext.User.Name+"'")
}

func (osGroups *OSGroups) refreshTaskCommands() (err *CommandExecutionError) {
	osGroups.Task.pd.RefreshLoginSession(taskContext.User.Name, taskContext.User.Password, !config.HeadlessTasks)
	for _, command := range osGroups.Task.Commands {
		command.SysProcAttr.Token = osGroups.Task.pd.LoginInfo.AccessToken()
	}
	return
}
