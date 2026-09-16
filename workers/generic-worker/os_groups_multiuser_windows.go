//go:build multiuser

package main

import (
	"github.com/taskcluster/taskcluster/v110/workers/generic-worker/win32"
)

func addUserToGroup(user, group string) error {
	return win32.AddLocalGroupMember(group, user)
}

func removeUserFromGroup(user, group string) error {
	return win32.RemoveLocalGroupMember(group, user)
}

func (osGroups *OSGroups) refreshTaskCommands() (err *CommandExecutionError) {
	ctx := osGroups.Task.GetContext()
	osGroups.Task.pd.RefreshLoginSession(ctx.User.Name, ctx.User.Password, !config.HeadlessTasks)
	for _, command := range osGroups.Task.Commands {
		command.SysProcAttr.Token = osGroups.Task.pd.LoginInfo.AccessToken()
	}
	return
}
