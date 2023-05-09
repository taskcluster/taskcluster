package main

import (
	"log"
	"os"

	docopt "github.com/docopt/docopt-go"
	"github.com/taskcluster/taskcluster/v50/internal"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/logging"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/runner"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/util"
)

func Usage() string {
	return `
The start-worker command starts Taskcluster workers.  It is typically invoked
during instance startup.  See the Taskcluster reference documentation for your
deployment for details on how to use this tool.

Usage:
	start-worker <runnerConfig>
`
}

func main() {
	logging.PatchStdLogger(nil)

	if err := util.DisableOOM(os.Getpid()); err != nil {
		log.Printf("Error disabling OOM killer for the start-worker process: %v", err)
	}

	opts, err := docopt.ParseArgs(Usage(), os.Args[1:], "start-worker "+internal.Version)
	if err != nil {
		log.Printf("Error parsing command-line arguments: %s", err)
		os.Exit(1)
	}

	filename := opts["<runnerConfig>"].(string)
	_, err = runner.Run(filename)
	if err != nil {
		log.Printf("%s", err)
		os.Exit(1)
	}
}
