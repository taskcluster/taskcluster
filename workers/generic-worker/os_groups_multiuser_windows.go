//go:build multiuser

package main

import (
	"github.com/taskcluster/taskcluster/v98/workers/generic-worker/host"
)

func addUserToGroup(user, group string) error {
	return host.Run("powershell", "-Command",
		"Add-LocalGroupMember -Group '"+host.EscapePowerShellSingleQuote(group)+"' -Member '"+host.EscapePowerShellSingleQuote(user)+"'")
}

func removeUserFromGroup(user, group string) error {
	return host.Run("powershell", "-Command",
		"Remove-LocalGroupMember -Group '"+host.EscapePowerShellSingleQuote(group)+"' -Member '"+host.EscapePowerShellSingleQuote(user)+"'")
}

func (osGroups *OSGroups) refreshTaskCommands() (err *CommandExecutionError) {
	ctx := osGroups.Task.GetContext()
	osGroups.Task.pd.RefreshLoginSession(ctx.User.Name, ctx.User.Password, !config.HeadlessTasks)
	for _, command := range osGroups.Task.Commands {
		command.SysProcAttr.Token = osGroups.Task.pd.LoginInfo.AccessToken()
	}
	return
}
