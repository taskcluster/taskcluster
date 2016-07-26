package main

import (
	"fmt"

	"github.com/taskcluster/taskcluster-cli/extpoints"
)

func init() {
	extpoints.Register("help", help{})
}

type help struct{}

func (help) ConfigOptions() map[string]extpoints.ConfigOption {
	return nil
}

func (help) Summary() string {
	return "Prints help for a command."
}

func (help) Usage() string {
	usage := "Show help for CLI commands.\n"
	usage += "\n"
	usage += "Usage: taskcluster help <command>\n"
	usage += "\n"
	usage += availableCommands()
	return usage
}

func (help) Execute(context extpoints.Context) bool {
	command := context.Arguments["<command>"].(string)
	provider := extpoints.CommandProviders()[command]
	if provider == nil {
		fmt.Println("Unknown command: ", command)
		return false
	}
	fmt.Print(provider.Usage())
	return true
}
