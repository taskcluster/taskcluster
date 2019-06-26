package main

import (
	"fmt"
	"log"

	"github.com/taskcluster/taskcluster-worker-runner/protocol"
	"github.com/taskcluster/taskcluster-worker-runner/provider"
	"github.com/taskcluster/taskcluster-worker-runner/runner"
	"github.com/taskcluster/taskcluster-worker-runner/secrets"
	"github.com/taskcluster/taskcluster-worker-runner/worker"
)

func StartWorker(runnercfg *runner.RunnerConfig) error {
	var run runner.Run
	run.WorkerConfig = run.WorkerConfig.Merge(runnercfg.WorkerConfig)

	// provider

	provider, err := provider.New(runnercfg)
	if err != nil {
		return err
	}

	log.Printf("Configuring with provider %s", runnercfg.Provider.ProviderType)
	err = provider.ConfigureRun(&run)
	if err != nil {
		return err
	}

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

	// secrets

	log.Println("Getting secrets from secrets service")
	err = secrets.ConfigureRun(runnercfg, &run)
	if err != nil {
		return err
	}

	// worker

	worker, err := worker.New(runnercfg)
	if err != nil {
		return err
	}

	log.Printf("Configuring for worker implementation %s", runnercfg.WorkerImplementation.Implementation)
	err = worker.ConfigureRun(&run)
	if err != nil {
		return err
	}

	// start

	log.Printf("Starting worker")
	transp, err := worker.StartWorker(&run)
	if err != nil {
		return err
	}

	// set up protocol

	proto := protocol.NewProtocol(transp)
	provider.SetProtocol(proto)
	worker.SetProtocol(proto)

	// call this before starting the proto so that there are no race conditions
	// around the capabilities negotiation
	err = provider.WorkerStarted()
	if err != nil {
		return err
	}

	proto.Start(false)

	// wait for the worker to terminate

	err = worker.Wait()
	if err != nil {
		return err
	}

	err = provider.WorkerFinished()
	if err != nil {
		return err
	}

	return nil
}
