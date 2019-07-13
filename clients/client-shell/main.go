package main

import (
	"os"

	"github.com/taskcluster/taskcluster-cli/cmds/root"
	"github.com/taskcluster/taskcluster-cli/config"
)

func main() {
	// set up the whole config thing
	config.Setup()

	// gentlemen, START YOUR ENGINES
	if err := root.Command.Execute(); err != nil {
		os.Exit(1)
	} else {
		os.Exit(0)
	}
}
