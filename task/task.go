package task

import (
	"github.com/taskcluster/taskcluster-cli/extpoints"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

func init() {
	extpoints.Register("task", task{})
}

type task struct {
}

func (task) ConfigOptions() map[string]extpoints.ConfigOption {
	return nil
}

func (task) Summary() string {
	return "Task related actions."
}

func (task) Usage() string {
	return `Task related actions.

Usage:
  taskcluster task status [--all-runs | --run ID] [--] <taskId>
  taskcluster task name [--] <taskId>
  taskcluster task group [--] <taskId>
  taskcluster task cancel [--] <taskId>

Options:
  --all-runs  Use all runs instead of only the latest
  --run ID    Use a specific run ID. By default, the latest run is selected
`
}

func (t task) Execute(context extpoints.Context) bool {
	args := context.Arguments

	if args["status"].(bool) {
		return executeSubCommand(context, t.runStatus)
	}
	if args["name"].(bool) {
		return executeSubCommand(context, t.runName)
	}
	if args["group"].(bool) {
		return executeSubCommand(context, t.runGroup)
	}
	if args["cancel"].(bool) {
		return executeSubCommand(context, t.runCancel)
	}

	return false
}

// executeSubCommand executes the given SubCommand.
func executeSubCommand(context extpoints.Context, subCommand SubCommand) bool {
	var c *tcclient.Credentials
	if context.Credentials != nil {
		c = context.Credentials.ToClientCredentials()
	}

	return subCommand(c, context.Arguments)
}
