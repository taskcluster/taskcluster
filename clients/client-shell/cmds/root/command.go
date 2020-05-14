// Package root defines the root of the application command tree.
package root

import (
	"github.com/spf13/cobra"
)

var (
	// Command is the root of the command tree.
	Command = setUpRootCmd()
)

// Setup presistent flags, pre-run and return root command
func setUpRootCmd() *cobra.Command {
	rootCmd := &cobra.Command{
		Use:   "taskcluster",
		Short: "Taskcluster Shell client.",
		Long:  "A shell interface to Taskcluster",
	}

	verbose := rootCmd.PersistentFlags().BoolP("verbose", "v", false, "verbose output")

	// function to run before every subcommand
	rootCmd.PersistentPreRun = func(cmd *cobra.Command, args []string) {
		setUpLogs(*verbose)
	}

	return rootCmd
}
