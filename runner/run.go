package runner

import (
	"fmt"
	"log"

	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/credexp"
	"github.com/taskcluster/taskcluster-worker-runner/files"
	"github.com/taskcluster/taskcluster-worker-runner/protocol"
	"github.com/taskcluster/taskcluster-worker-runner/provider"
	"github.com/taskcluster/taskcluster-worker-runner/run"
	"github.com/taskcluster/taskcluster-worker-runner/secrets"
	"github.com/taskcluster/taskcluster-worker-runner/worker"
)

// Check that the provider filled the state fields it was expected to.
func checkProviderResults(state *run.State) error {
	if state.RootURL == "" {
		return fmt.Errorf("provider did not set RootURL")
	}

	if state.Credentials.ClientID == "" {
		return fmt.Errorf("provider did not set Credentials.ClientID")
	}

	if state.WorkerPoolID == "" {
		return fmt.Errorf("provider did not set WorkerPoolID")
	}

	if state.WorkerGroup == "" {
		return fmt.Errorf("provider did not set WorkerGroup")
	}

	if state.WorkerID == "" {
		return fmt.Errorf("provider did not set WorkerID")
	}

	return nil
}

// Run the worker.  This embodies the execution of the start-worker command.
func Run(configFile string) error {
	// load configuration

	log.Printf("Loading taskcluster-worker-runner configuration from %s", configFile)
	runnercfg, err := cfg.LoadRunnerConfig(configFile)
	if err != nil {
		return fmt.Errorf("Error lading runner config file %s: %s", configFile, err)
	}

	var state run.State
	state.WorkerConfig = state.WorkerConfig.Merge(runnercfg.WorkerConfig)

	// initialize provider

	provider, err := provider.New(runnercfg)
	if err != nil {
		return err
	}

	log.Printf("Configuring with provider %s", runnercfg.Provider.ProviderType)
	err = provider.ConfigureRun(&state)
	if err != nil {
		return err
	}

	err = checkProviderResults(&state)
	if err != nil {
		return err
	}

	// fetch secrets

	log.Println("Getting secrets from secrets service")
	err = secrets.ConfigureRun(runnercfg, &state)
	if err != nil {
		return err
	}

	// initialize worker

	worker, err := worker.New(runnercfg)
	if err != nil {
		return err
	}

	log.Printf("Configuring for worker implementation %s", runnercfg.WorkerImplementation.Implementation)
	err = worker.ConfigureRun(&state)
	if err != nil {
		return err
	}

	// extract files

	log.Printf("Writing files")
	err = files.ExtractAll(state.Files)
	if err != nil {
		return err
	}

	// handle credential expiratoin
	ce := credexp.New(&state)

	// start

	log.Printf("Starting worker")
	transp, err := worker.StartWorker(&state)
	if err != nil {
		return err
	}

	// set up protocol

	proto := protocol.NewProtocol(transp)
	provider.SetProtocol(proto)
	worker.SetProtocol(proto)
	ce.SetProtocol(proto)

	// call the WorkerStarted methods before starting the proto so that there
	// are no race conditions around the capabilities negotiation
	err = ce.WorkerStarted()
	if err != nil {
		return err
	}

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

	// shut things down

	err = provider.WorkerFinished()
	if err != nil {
		return err
	}

	err = ce.WorkerFinished()
	if err != nil {
		return err
	}

	return nil
}
