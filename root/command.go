package root

import "github.com/spf13/cobra"

var (
	// Command is the root of the command tree.
	Command = &cobra.Command{
		Use:   "taskcluster",
		Short: "TaskCluster CLI client.",
		Long:  "A command-line interface to TaskCluster - see https://docs.taskcluster.net.",
	}
)
