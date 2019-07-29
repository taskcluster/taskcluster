package main

import (
	"log"
	"os"

	docopt "github.com/docopt/docopt-go"
	tcworkerrunner "github.com/taskcluster/taskcluster-worker-runner"
	"github.com/taskcluster/taskcluster-worker-runner/provider"
	"github.com/taskcluster/taskcluster-worker-runner/runner"
	"github.com/taskcluster/taskcluster-worker-runner/worker"
)

func Usage() string {
	return `
start-worker starts Taskcluster workers.

Usage:
	start-worker <runnerConfig>

` + runner.Usage() + `

` + provider.Usage() + `

` + worker.Usage()
}

func main() {
	opts, err := docopt.ParseArgs(Usage(), os.Args[1:], "start-worker "+tcworkerrunner.Version)
	if err != nil {
		log.Printf("Error parsing command-line arguments: %s", err)
		os.Exit(1)
	}

	filename := opts["<runnerConfig>"].(string)
	err = runner.Run(filename)
	if err != nil {
		log.Printf("%s", err)
		os.Exit(1)
	}
}
