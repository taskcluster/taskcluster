//go:build multiuser

package main

import (
	"fmt"
	"os/user"
)

// one instance per task
type OSGroups struct {
	Task *TaskRun
	// keep track of which groups we successfully update
	AddedGroups []*user.Group
}

func (osGroups *OSGroups) Start() *CommandExecutionError {
	groupNames := osGroups.Task.Payload.OSGroups
	if len(groupNames) == 0 {
		return nil
	}
	if osGroups.Task.Payload.Features.RunTaskAsCurrentUser {
		osGroups.Task.Infof("Not adding task user to group(s) %v since we are running as current user.", groupNames)
		return nil
	}
	ctx := osGroups.Task.GetContext()
	notAddedGroupNames := []string{}
	for _, groupName := range groupNames {
		err := addUserToGroup(ctx.User.Name, groupName)
		if err != nil {
			notAddedGroupNames = append(notAddedGroupNames, groupName)
			osGroups.Task.Errorf("[osGroups] Could not add task user to OS group %v: %v", groupName, err)
			continue
		}
		group, err := user.LookupGroup(groupName)
		if err != nil {
			notAddedGroupNames = append(notAddedGroupNames, groupName)
			osGroups.Task.Errorf("[osGroups] Could not look up group ID for OS group %v: %v", groupName, err)
			continue
		}
		osGroups.AddedGroups = append(osGroups.AddedGroups, group)
	}
	if len(notAddedGroupNames) > 0 {
		return MalformedPayloadError(fmt.Errorf("could not add task user to OS group(s) %v", notAddedGroupNames))
	}
	return osGroups.refreshTaskCommands()
}

func (osGroups *OSGroups) Stop(err *ExecutionErrors) {
	ctx := osGroups.Task.GetContext()
	notRemovedGroupNames := []string{}
	for _, group := range osGroups.AddedGroups {
		e := removeUserFromGroup(ctx.User.Name, group.Name)
		if e != nil {
			notRemovedGroupNames = append(notRemovedGroupNames, group.Name)
			osGroups.Task.Errorf("[osGroups] Could not remove task user from OS group %v: %v", group, e)
		}
	}
	if len(notRemovedGroupNames) > 0 {
		err.add(executionError(internalError, errored, fmt.Errorf("could not remove task user from OS group(s) %v", notRemovedGroupNames)))
	}
}
