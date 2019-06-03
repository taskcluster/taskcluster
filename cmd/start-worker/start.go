package main

import (
	"fmt"
	"log"

	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/provider"
	"github.com/taskcluster/taskcluster-worker-runner/runner"
)

func StartWorker(cfg *cfg.RunnerConfig) error {
	provider, err := provider.New(cfg)
	if err != nil {
		return err
	}

	var run runner.Run
	run.WorkerConfig = cfg.WorkerConfig

	log.Printf("Configuring with provider %s", cfg.Provider.ProviderType)
	provider.ConfigureRun(&run)
	if run.RootURL == "" {
		return fmt.Errorf("provider did not set RootURL")
	}

	if run.Credentials.ClientID == "" {
		return fmt.Errorf("provider did not set Credentials.ClientID")
	}

	if run.WorkerPoolID == "" {
		return fmt.Errorf("provider did not set WorkerPoolID")
	}

	if run.WorkerGroup == "" {
		return fmt.Errorf("provider did not set WorkerGroup")
	}

	if run.WorkerID == "" {
		return fmt.Errorf("provider did not set WorkerID")
	}

	fmt.Printf("%#v\n", run)

	return nil
}
