package main

import (
	"fmt"
)

func (osGroups *OSGroups) Start() *CommandExecutionError {
	groups := osGroups.Task.Payload.OSGroups
	if len(groups) == 0 {
		return nil
	}
	if config.RunTasksAsCurrentUser {
		osGroups.Task.Infof("Not adding task user to group(s) %v since we are running as current user.", groups)
		return nil
	}
	updatedGroups, notUpdatedGroups := osGroups.Task.addUserToGroups(groups)
	osGroups.AddedGroups = updatedGroups
	if len(notUpdatedGroups) > 0 {
		return MalformedPayloadError(fmt.Errorf("Could not add task user to os group(s): %v", notUpdatedGroups))
	}
	taskContext.pd.RefreshLoginSession(taskContext.User.Name, taskContext.User.Password)
	for _, command := range osGroups.Task.Commands {
		command.SysProcAttr.Token = taskContext.pd.LoginInfo.AccessToken()
	}
	return nil
}

func (osGroups *OSGroups) Stop(err *ExecutionErrors) {
	groups := osGroups.AddedGroups
	_, notUpdatedGroups := osGroups.Task.removeUserFromGroups(groups)
	if len(notUpdatedGroups) > 0 {
		err.add(MalformedPayloadError(fmt.Errorf("Could not remove task user from os group(s): %v", notUpdatedGroups)))
	}
}
