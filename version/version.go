package version

import (
	"fmt"

	"github.com/taskcluster/taskcluster-cli/extpoints"
)

// VersionNumber is a string with the formatted version data.
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
  taskcluster version
`
}

func (version) Usage() string {
	return usage()
}

func (version) Execute(context extpoints.Context) bool {
	fmt.Println(VersionNumber)
	return true
}
