package exit

import (
	"log"

	taskcluster "github.com/taskcluster/taskcluster/v50/clients/client-go"
	"github.com/taskcluster/taskcluster/v50/clients/client-go/tcworkermanager"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/tc"
	"github.com/taskcluster/taskcluster/v50/tools/workerproto"
)

// ExitManager manages worker exit.
type ExitManager struct {
	runnercfg *cfg.RunnerConfig
	state     *run.State

	// Factory for worker-manager clients
	factory tc.WorkerManagerClientFactory
}

func (em *ExitManager) SetProtocol(proto *workerproto.Protocol) {
	// On "shutdown", request worker-manager to terminate us; if that fails,
	// try shutting down
	proto.Register("shutdown", func(msg workerproto.Message) {
		em.shutdown()
	})
	proto.AddCapability("shutdown")
}

func (em *ExitManager) WorkerFinished() error {
	em.shutdown()
	return nil
}

// Try calling worker-manager's RemoveWorker method, and if successful
// exit and wait for the instance to be terminated.  Otherwise, try
// shutting down the host directly
func (em *ExitManager) shutdown() {
	em.state.Lock()
	defer em.state.Unlock()

	// In anticipation of
	// https://github.com/taskcluster/taskcluster/issues/2886, this is a
	// fast-and-dirty way to determine what it means to "shut down" this
	// worker.
	dynamicallyProvisioned := !(em.runnercfg.Provider.ProviderType == "static" || em.runnercfg.Provider.ProviderType == "standalone")

	if !dynamicallyProvisioned {
		log.Println("Host is not dynamically provisioned; exiting")
		return
	}

	log.Println("Shutting down on request from worker")

	shutdown := func() {
		log.Printf("Falling back to system shutdown")
		if err := Shutdown(); err != nil {
			log.Printf("Error shutting down the worker: %v\n", err)
		}
	}

	wc, err := em.factory(em.state.RootURL, &em.state.Credentials)
	if err != nil {
		log.Printf("Error instanciating worker-manager client: %v\n", err)
		shutdown()
	}

	if err = wc.RemoveWorker(em.state.WorkerPoolID, em.state.WorkerGroup, em.state.WorkerID); err != nil {
		log.Printf("Error removing the worker: %v\n", err)
		shutdown()
	}
}

// Make a new ExitManager object
func New(runnercfg *cfg.RunnerConfig, state *run.State) *ExitManager {
	return new(runnercfg, state, nil)
}

// Private constructor allowing injection of a fake factory
func new(runnercfg *cfg.RunnerConfig, state *run.State, factory tc.WorkerManagerClientFactory) *ExitManager {
	if factory == nil {
		factory = func(rootURL string, credentials *taskcluster.Credentials) (tc.WorkerManager, error) {
			prov := tcworkermanager.New(credentials, rootURL)
			return prov, nil
		}
	}

	return &ExitManager{
		runnercfg: runnercfg,
		state:     state,
		factory:   factory,
	}
}
