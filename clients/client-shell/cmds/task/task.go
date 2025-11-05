// Package task  implements the task subcommands.
package task

import (
	"github.com/taskcluster/taskcluster/v92/clients/client-shell/cmds/root"

	"github.com/spf13/cobra"
)

var (
	// Command is the root of the task subtree.
	Command = &cobra.Command{
		Use:   "task",
		Short: "Provides task-related actions and commands.",
	}
	statusCmd = &cobra.Command{
		Use:   "status <taskId>",
		Short: "Get the status of a task.",
		RunE:  executeHelperE(runStatus),
	}
	artifactsCmd = &cobra.Command{
		Use:   "artifacts <taskId>",
		Short: "Get the name of the artifacts of a task.",
		RunE:  executeHelperE(runArtifacts),
	}
	retriggerCmd = &cobra.Command{
		Use:   "retrigger <taskId>",
		Short: "Re-trigger a task (new taskId, updated timestamps).",
		RunE:  executeHelperE(runRetrigger),
	}
	rerunCmd = &cobra.Command{
		Use:   "rerun <taskId>",
		Short: "Rerun a task.",
		RunE:  executeHelperE(runRerun),
	}

	runcancelCmd = &cobra.Command{
		Use:   "cancel <taskId>",
		Short: "Cancel a task.",
		RunE:  executeHelperE(runCancel),
	}

	runcompleteCmd = &cobra.Command{
		Use:   "complete <taskId>",
		Short: "Completes a task.",
		RunE:  executeHelperE(runComplete),
	}
)

var log = root.Logger

func init() {
	statusCmd.Flags().BoolP("all-runs", "a", false, "Check all runs of the task.")
	statusCmd.Flags().IntP("run", "r", -1, "Specifies which run to consider.")

	artifactsCmd.Flags().IntP("run", "r", -1, "Specifies which run to consider.")

	retriggerCmd.Flags().BoolP("exact", "e", false, "Retrigger in exact mode. WARNING: THIS MAY HAVE SIDE EFFECTS. USE AFTER YOU READ THE SOURCE CODE.")

	rerunCmd.Flags().BoolP("noop", "n", false, "Using this flag, will tell the command to not actually run, but prints out what it would do.")
	rerunCmd.Flags().BoolP("confirm", "c", false, "Prompts user with a confirmation (y/n) before performing any changes.")
	rerunCmd.Flags().BoolP("force", "f", false, "Allows a user to rerun a task not in the exception or failed state.")

	runcancelCmd.Flags().BoolP("noop", "n", false, "Using this flag, will tell the command to not actually run, but prints out what it would do.")
	runcancelCmd.Flags().BoolP("confirm", "c", false, "Prompts user with a confirmation (y/n) before performing any changes.")

	runcompleteCmd.Flags().BoolP("noop", "n", false, "Using this flag, will tell the command to not actually run, but prints out what it would do.")
	runcompleteCmd.Flags().BoolP("confirm", "c", false, "Prompts user with a confirmation (y/n) before performing any changes.")
	// Commands that fetch information
	Command.AddCommand(
		// status
		statusCmd,
		// name
		&cobra.Command{
			Use:   "name <taskId>",
			Short: "Get the name of a task.",
			RunE:  executeHelperE(runName),
		},
		// definition
		&cobra.Command{
			Use:   "def <taskId>",
			Short: "Get the full definition of a task.",
			RunE:  executeHelperE(runDef),
		},
		// group
		&cobra.Command{
			Use:   "group <taskId>",
			Short: "Get the taskGroupID of a task.",
			RunE:  executeHelperE(runGroup),
		},
		// artifacts
		artifactsCmd,
		// log
		&cobra.Command{
			Use:   "log <taskId>",
			Short: "Streams the log until completion.",
			RunE:  executeHelperE(runLog),
		},
	)

	// Commands that take actions
	Command.AddCommand(

		// cancel
		runcancelCmd,
		// retrigger
		retriggerCmd,
		// rerun
		rerunCmd,
		// cancel
		runcompleteCmd,
	)

	// Add the task subtree to the root.
	root.Command.AddCommand(Command)
}
