// Package root defines the root of the application command tree.
package root

import "github.com/spf13/cobra"

var (
	// Command is the root of the command tree.
	Command = &cobra.Command{
		Use:   "taskcluster",
		Short: "Taskcluster Shell client.",
		Long:  "A shell interface to Taskcluster",
	}
)
