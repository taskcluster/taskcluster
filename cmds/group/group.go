package group

import (
	"github.com/spf13/cobra"
	"github.com/taskcluster/taskcluster-cli/root"
)

var (
	// Command is the root of the group subtree.
	Command = &cobra.Command{
		Use:   "group",
		Short: "Provides taskgroup-related actions and commands.",
	}
)

func init() {
	cancelCmd := &cobra.Command{
		Use:   "cancel <taskGroupId>",
		Short: "Cancel a whole group by taskGroupId.",
		RunE:  executeHelperE(runCancel),
	}
	Command.AddCommand(cancelCmd)

	root.Command.AddCommand(Command)
}
