//go:build darwin || linux || freebsd

package main

import (
	"fmt"
	"strconv"
)

func (osGroups *OSGroups) refreshTaskCommands() (err *CommandExecutionError) {
	gids := make([]uint32, len(osGroups.AddedGroups))
	for i, group := range osGroups.AddedGroups {
		gid, err := strconv.ParseUint(group.Gid, 10, 32)
		if err != nil {
			panic(fmt.Sprintf("Group ID for %q is %q which isn't an int: %v", group.Name, group.Gid, err))
		}
		gids[i] = uint32(gid)
	}
	for _, command := range osGroups.Task.Commands {
		command.SysProcAttr.Credential.Groups = append(command.SysProcAttr.Credential.Groups, gids...)
	}
	return
}
