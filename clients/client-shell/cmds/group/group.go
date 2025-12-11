// Package group implements the group interaction subcommands.
package group

import (
	"github.com/spf13/cobra"
	"github.com/taskcluster/taskcluster/v95/clients/client-shell/cmds/root"
)

var (
	// Command is the root of the group subtree.
	Command = &cobra.Command{
		Use:   "group",
		Short: "Provides taskgroup-related actions and commands.",
	}
)

func init() {
	root.Command.AddCommand(Command)
}
