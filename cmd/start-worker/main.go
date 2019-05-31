package main

import (
	"fmt"
	"log"
	"os"

	docopt "github.com/docopt/docopt-go"
	"github.com/taskcluster/taskcluster-worker-runner/cfg"
)

func usage() string {
	return `
start-worker starts Taskcluster workers.

  Usage:
	start-worker <startWorkerConfig>

` + cfg.Usage()
}

func main() {
	opts, err := docopt.Parse(usage(), nil, true, "start-worker", false, true)
	if err != nil {
		log.Printf("Error parsing command-line arguments: %s", err)
		os.Exit(1)
	}

	cfg, err := cfg.Load(opts["<startWorkerConfig>"].(string))
	if err != nil {
		log.Printf("Error loading start-worker config: %s", err)
		os.Exit(1)
	}

	fmt.Printf("%#v\n", cfg)
}
