package task

import (
	"fmt"

	"github.com/taskcluster/taskcluster-cli/extpoints"
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
	return "Prints the TaskCluster version."
}

func (task) Usage() string {
	return `Usage:
  taskcluster task COMMAND
`
}

func (task) Execute(context extpoints.Context) bool {
	//command := context.Arguments["COMMAND"].(string)
	fmt.Println("it werks")
	return true
}
