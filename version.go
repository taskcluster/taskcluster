package main

import (
	"fmt"

	"github.com/taskcluster/taskcluster-cli/extpoints"
)

func init() {
	extpoints.Register("version", version{})
}

type version struct{}

func (version) ConfigOptions() map[string]extpoints.ConfigOption {
	return nil
}

func (version) Summary() string {
	return "Prints the TaskCluster version."
}

func (version) Usage() string {
	usage := "Prints the TaskCluster version\n"
	usage += "\n"
	usage += "Usage:\n"
	usage += "  taskcluster version\n"
	return usage
}

func (version) Execute(context extpoints.Context) bool {
	command := context.Arguments["<command>"].(string)
	provider := extpoints.CommandProviders()[command]
	if provider == nil {
		fmt.Println("Unknown command: ", command)
		return false
	}
	fmt.Print(provider.Usage())
	return true
}
