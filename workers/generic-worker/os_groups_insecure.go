//go:build insecure

package main

import (
	"fmt"
	"log"
	"os/user"
	"strings"
)

// one instance per task
type OSGroups struct {
	Task *TaskRun
}

func (osGroups *OSGroups) Start() *CommandExecutionError {
	groupNames := osGroups.Task.Payload.OSGroups
	if len(groupNames) == 0 {
		return nil
	}

	userGroups, err := currentUserGroups()
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("failed to get user groups: %v", err))
	}

	notInGroups := checkUserGroupsInList(groupNames, userGroups)
	if len(notInGroups) > 0 {
		return MalformedPayloadError(fmt.Errorf("task definition contains unsupported osGroups: %v\nallowed values (on this worker pool): %v", notInGroups, userGroups))
	}

	return nil
}

func (osGroups *OSGroups) Stop(err *ExecutionErrors) {
}

func currentUserGroups() (map[string]bool, error) {
	currentUser, err := user.Current()
	if err != nil {
		return nil, fmt.Errorf("failed to get current user: %v", err)
	}

	groupIDs, err := currentUser.GroupIds()
	if err != nil {
		return nil, fmt.Errorf("failed to get current user's group ids: %v", err)
	}

	primaryGID := currentUser.Gid
	userGroups := make(map[string]bool)
	for _, gid := range groupIDs {
		if gid == primaryGID {
			continue
		}
		group, err := user.LookupGroupId(gid)
		if err != nil {
			log.Printf("failed to lookup group: %v", err)
			continue
		}
		userGroups[strings.ToLower(group.Name)] = true
	}

	return userGroups, nil
}

func checkUserGroupsInList(groupsToCheck []string, userGroups map[string]bool) []string {
	notMemberOf := []string{}
	for _, group := range groupsToCheck {
		if !userGroups[strings.ToLower(group)] {
			notMemberOf = append(notMemberOf, group)
		}
	}
	return notMemberOf
}
