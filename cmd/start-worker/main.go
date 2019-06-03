package main

import (
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

	filename := opts["<startWorkerConfig>"].(string)
	log.Printf("Loading taskcluster-worker-runner configuration from %s", filename)
	cfg, err := cfg.Load(filename)
	if err != nil {
		log.Printf("Error loading start-worker config: %s", err)
		os.Exit(1)
	}

	err = StartWorker(cfg)
	if err != nil {
		log.Printf("%s", err)
		os.Exit(1)
	}
}
