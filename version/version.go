package version

import (
	"fmt"

	"github.com/taskcluster/taskcluster-cli/extpoints"
)

var VersionNumber = fmt.Sprintf("taskcluster (TaskCluster CLI) version %d.%d.%d", 1, 0, 0)

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

func usage() string {
	return `Usage:
  taskcluster VERSION
`
}

func (version) Usage() string {
	return usage()
}

func (version) Execute(context extpoints.Context) bool {
	command := context.Arguments["VERSION"].(string)
	provider := extpoints.CommandProviders()[command]
	if provider == nil {
		panic(fmt.Sprintf("Unknown command: %s", command))
		return false
	}
	fmt.Println(VersionNumber)
	return true
}
