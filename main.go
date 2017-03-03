package main

import (
	"os"

	"github.com/taskcluster/taskcluster-cli/config"
	"github.com/taskcluster/taskcluster-cli/root"
)

func main() {
	// set up the whole config thing
	config.Setup()

	// gentlemen, START YOUR ENGINES
	if err := root.Command.Execute(); err != nil {
		os.Exit(0)
	} else {
		os.Exit(1)
	}
}
