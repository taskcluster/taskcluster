// Package root defines the root of the application command tree.
package root

import (
	"io/ioutil"
	"log"
	"os"

	"github.com/spf13/cobra"
)

var (
	// Command is the root of the command tree.
	Command = setUpRootCmd()
	// Logger is the default log.Logger of the commands
	Logger = log.New(ioutil.Discard, "INFO: ", log.Lshortfile)
)

// Setup presistent flags and pre-run and return root command
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

// setup log output based of --verbose flag
func setUpLogs(enable bool) {
	if enable {
		Logger.SetOutput(os.Stdout)
	}
}
