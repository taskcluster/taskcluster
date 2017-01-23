package group

import (
	"github.com/taskcluster/taskcluster-cli/extpoints"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

func init() {
	extpoints.Register("group", cmd{})
}

type cmd struct {
}

func (cmd) ConfigOptions() map[string]extpoints.ConfigOption {
	return nil
}

func (cmd) Summary() string {
	return "Group related actions."
}

func (cmd) Usage() string {
	return `Group related actions.

Usage:
  groupcluster group cancel [--] <groupId>
`
}

func (cmd) Execute(context extpoints.Context) bool {
	args := context.Arguments

	if args["cancel"].(bool) {
		return executeSubCommand(context, runCancel)
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
