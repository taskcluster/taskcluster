package version

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/taskcluster/taskcluster-cli/cmds/root"
)

var (
	// Command is the cobra command representing the version subtree.
	Command = &cobra.Command{
		Use:   "version",
		Short: "Prints the TaskCluster version.",
		Run:   printVersion,
	}

	// VersionNumber is a formatted string with the version information.
	VersionNumber = "1.0.0"
)

func init() {
	root.Command.AddCommand(Command)
}

func printVersion(cmd *cobra.Command, _ []string) {
	fmt.Fprintf(cmd.OutOrStdout(), "taskcluster (TaskCluster CLI) version %s\n", VersionNumber)
}
