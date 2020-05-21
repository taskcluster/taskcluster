package runner

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"os"

	"github.com/taskcluster/taskcluster/v30/internal/workerproto"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/credexp"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/files"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/logging"
	loggingProtocol "github.com/taskcluster/taskcluster/v30/tools/worker-runner/logging/protocol"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/perms"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/provider"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/secrets"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/worker"
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

		var encoded []byte
		encoded, err = ioutil.ReadFile(runnercfg.CacheOverRestarts)
		if err == nil {
			log.Printf("Loading cached state from %s", runnercfg.CacheOverRestarts)

			err = json.Unmarshal(encoded, &state)
			if err != nil {
				return
			}
			runCached = true

			// just double-check that the permissions are correct..
			err = perms.VerifyPrivateToOwner(runnercfg.CacheOverRestarts)
			if err != nil {
				return
			}
		} else if !os.IsNotExist(err) {
			return
		}
	}

	state.WorkerConfig = state.WorkerConfig.Merge(runnercfg.WorkerConfig)

	// initialize provider

	provider, err := provider.New(runnercfg)
	if err != nil {
		return
	}

	if !runCached {
		log.Printf("Configuring with provider %s", runnercfg.Provider.ProviderType)
		err = provider.ConfigureRun(&state)
		if err != nil {
			return
		}
	} else {
		err = provider.UseCachedRun(&state)
		if err != nil {
			return
		}
	}

	err = state.CheckProviderResults()
	if err != nil {
		return
	}

	// log the worker identity; this is useful for finding the worker in logfiles
	log.Printf("Identified as worker %s/%s", state.WorkerGroup, state.WorkerID)

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
		log.Printf("Caching runnercfg at %s", runnercfg.CacheOverRestarts)
		var encoded []byte
		encoded, err = json.Marshal(&state)
		if err != nil {
			return
		}
		err = ioutil.WriteFile(runnercfg.CacheOverRestarts, encoded, 0700)
		if err != nil {
			return
		}

		// This file contains secrets, so ensure that this is really only
		// accessible to the file owner (and having just created the file, that
		// should be the current user).
		err = perms.MakePrivateToOwner(runnercfg.CacheOverRestarts)
		if err != nil {
			return
		}

		err = perms.VerifyPrivateToOwner(runnercfg.CacheOverRestarts)
		if err != nil {
			return
		}
	}

	// extract files

	if !runCached {
		log.Printf("Writing files")
		err = files.ExtractAll(state.Files)
		if err != nil {
			return
		}
	}

	// handle credential expiratoin
	ce := credexp.New(&state)

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
	ce.SetProtocol(proto)

	// call the WorkerStarted methods before starting the proto so that there
	// are no race conditions around the capabilities negotiation
	err = ce.WorkerStarted()
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

	err = provider.WorkerFinished(&state)
	if err != nil {
		return
	}

	err = ce.WorkerFinished()
	if err != nil {
		return
	}

	return
}
