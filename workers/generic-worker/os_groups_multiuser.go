//go:build multiuser

package main

import (
	"fmt"
)

// one instance per task
type OSGroups struct {
	Task *TaskRun
	// keep track of which groups we successfully update
	AddedGroups []string
}

func (osGroups *OSGroups) Start() *CommandExecutionError {
	groups := osGroups.Task.Payload.OSGroups
	if len(groups) == 0 {
		return nil
	}
	if config.RunTasksAsCurrentUser {
		osGroups.Task.Infof("Not adding task user to group(s) %v since we are running as current user.", groups)
		return nil
	}
	notAddedGroups := []string{}
	for _, group := range groups {
		err := addUserToGroup(taskContext.User.Name, group)
		if err == nil {
			osGroups.AddedGroups = append(osGroups.AddedGroups, group)
		} else {
			notAddedGroups = append(notAddedGroups, group)
			osGroups.Task.Errorf("[osGroups] Could not add task user to OS group %v: %v", group, err)
		}
	}
	if len(notAddedGroups) > 0 {
		return MalformedPayloadError(fmt.Errorf("Could not add task user to OS group(s) %v", notAddedGroups))
	}
	return osGroups.refreshTaskCommands()
}

func (osGroups *OSGroups) Stop(err *ExecutionErrors) {
	notRemovedGroups := []string{}
	for _, group := range osGroups.AddedGroups {
		e := removeUserFromGroup(taskContext.User.Name, group)
		if e != nil {
			notRemovedGroups = append(notRemovedGroups, group)
			osGroups.Task.Errorf("[osGroups] Could not remove task user from OS group %v: %v", group, e)
		}
	}
	if len(notRemovedGroups) > 0 {
		err.add(executionError(internalError, errored, fmt.Errorf("Could not remove task user from OS group(s) %v", notRemovedGroups)))
	}
}
