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
  taskcluster task status [--all-runs] [--] <taskId>
  taskcluster task name [--] <taskId>
  taskcluster task group [--] <taskId>

Options:
  --all-runs  Use all runs instead of only the latest
`
}

func (t task) Execute(context extpoints.Context) bool {
	var c *tcclient.Credentials
	if context.Credentials != nil {
		c = context.Credentials.ToClientCredentials()
	}

	args := context.Arguments

	if args["status"].(bool) {
		return t.runStatus(c, args)
	}
	if args["name"].(bool) {
		return t.runName(c, args)
	}
	if args["group"].(bool) {
		return t.runGroup(c, args)
	}

	return false
}
