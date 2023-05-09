package runner

import (
	"fmt"
	"log"

	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/errorreport"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/exit"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/files"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/logging"
	loggingProtocol "github.com/taskcluster/taskcluster/v50/tools/worker-runner/logging/protocol"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/provider"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/registration"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/secrets"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/worker"
	"github.com/taskcluster/taskcluster/v50/tools/workerproto"
)

// Run the worker.  This embodies the execution of the start-worker command.
func Run(configFile string) (state run.State, err error) {
	// load configuration

	log.Printf("Loading worker-runner configuration from %s", configFile)
	runnercfg, err := cfg.LoadRunnerConfig(configFile)
	if err != nil {
		err = fmt.Errorf("Error loading runner config file %s: %s", configFile, err)
		return
	}

	logging.Configure(runnercfg)

	runCached := false
	if runnercfg.CacheOverRestarts != "" {
		runCached, err = run.ReadCacheFile(&state, runnercfg.CacheOverRestarts)
		if err != nil {
			return
		}
	}

	state.Lock()
	state.WorkerConfig = state.WorkerConfig.Merge(runnercfg.WorkerConfig)
	state.Unlock()

	// initialize provider and (re)register the worker

	provider, err := provider.New(runnercfg)
	if err != nil {
		return
	}

	reg := registration.New(runnercfg, &state)
	er := errorreport.New(&state)
	em := exit.New(runnercfg, &state)

	if !runCached {
		log.Printf("Configuring with provider %s", runnercfg.Provider.ProviderType)
		err = provider.ConfigureRun(&state)
		if err != nil {
			return
		}

		workerIdentityProof, err2 := provider.GetWorkerIdentityProof()
		if err2 != nil {
			err = err2
			return
		}
		if workerIdentityProof != nil {
			err = reg.RegisterWorker(workerIdentityProof)
			if err != nil {
				return
			}
		}
	} else {
		err = provider.UseCachedRun(&state)
		if err != nil {
			return
		}

		err = reg.UseCachedRun()
		if err != nil {
			return
		}
	}

	err = state.CheckProviderResults()
	if err != nil {
		return
	}

	// log the worker identity; this is useful for finding the worker in logfiles
	state.Lock()
	log.Printf("Identified as worker %s/%s", state.WorkerGroup, state.WorkerID)
	state.Unlock()

	// fetch secrets

	if !runCached && runnercfg.GetSecrets {
		log.Println("Getting secrets from secrets service")
		err = secrets.ConfigureRun(runnercfg, &state)
		if err != nil {
			return
		}
	}

	// initialize worker

	worker, err := worker.New(runnercfg)
	if err != nil {
		return
	}

	if !runCached {
		log.Printf("Configuring for worker implementation %s", runnercfg.WorkerImplementation.Implementation)
		err = worker.ConfigureRun(&state)
		if err != nil {
			return
		}
	} else {
		err = worker.UseCachedRun(&state)
		if err != nil {
			return
		}
	}

	// cache the state if we might end up restarting

	if !runCached && runnercfg.CacheOverRestarts != "" {
		err = state.WriteCacheFile(runnercfg.CacheOverRestarts)
		if err != nil {
			return
		}
	}

	// extract files

	if !runCached {
		log.Printf("Writing files")
		state.Lock()
		err = files.ExtractAll(state.Files)
		state.Unlock()
		if err != nil {
			return
		}
	}

	// start

	log.Printf("Starting worker")
	transp, err := worker.StartWorker(&state)
	if err != nil {
		return
	}

	// set up protocol

	proto := workerproto.NewProtocol(transp)

	// inform other components about the protocol
	loggingProtocol.SetProtocol(proto)
	provider.SetProtocol(proto)
	worker.SetProtocol(proto)
	reg.SetProtocol(proto)
	er.SetProtocol(proto)
	em.SetProtocol(proto)

	// call the WorkerStarted methods before starting the proto so that there
	// are no race conditions around the capabilities negotiation
	err = reg.WorkerStarted()
	if err != nil {
		return
	}

	err = provider.WorkerStarted(&state)
	if err != nil {
		return
	}

	proto.Start(false)

	// wait for the worker to terminate, first reading everything from the
	// protocol to capture any output just before the process exited
	proto.WaitForEOF()
	err = worker.Wait()
	if err != nil {
		return
	}

	// shut things down
	// NOTE: this section is not reached for generic-worker reboots.

	err = provider.WorkerFinished(&state)
	if err != nil {
		return
	}

	err = reg.WorkerFinished()
	if err != nil {
		return
	}

	err = em.WorkerFinished()
	if err != nil {
		return
	}

	return
}
