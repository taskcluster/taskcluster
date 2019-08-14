package genericworker

import (
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"os"
	"os/exec"
	"strings"

	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/protocol"
	"github.com/taskcluster/taskcluster-worker-runner/run"
	"github.com/taskcluster/taskcluster-worker-runner/worker/worker"
)

type genericworkerConfig struct {
	Path       string
	ConfigPath string
}

type genericworker struct {
	runnercfg *cfg.RunnerConfig
	wicfg     genericworkerConfig
	cmd       *exec.Cmd
}

func (d *genericworker) ConfigureRun(state *run.State) error {
	var err error

	// copy some values from the provider metadata, if they are set; if not,
	// generic-worker will fall back to defaults
	for cfg, md := range map[string]string{
		// generic-worker config : providerMetadata
		// required
		"publicIp": "public-ipv4",
		// optional
		"privateIP":        "local-ipv4",
		"instanceType":     "instance-type",
		"instanceID":       "instance-id",
		"region":           "region",
		"availabilityZone": "availability-zone",
		"zone":             "zone",
	} {
		v, ok := state.ProviderMetadata[md]
		if ok {
			state.WorkerConfig, err = state.WorkerConfig.Set(cfg, v)
			if err != nil {
				return err
			}
		} else {
			log.Printf("provider metadata %s not available; not setting config %s", md, cfg)
		}
	}

	set := func(key, value string) {
		var err error
		// only programming errors can cause this to fail
		state.WorkerConfig, err = state.WorkerConfig.Set(key, value)
		if err != nil {
			panic(err)
		}
	}

	// pass all of provider metadata in as workerTypeMetadata
	state.WorkerConfig, err = state.WorkerConfig.Set("workerTypeMetadata", state.ProviderMetadata)
	if err != nil {
		panic(err)
	}

	// split to workerType and provisionerId
	splitWorkerPoolID := strings.SplitAfterN(state.WorkerPoolID, "/", 2)

	// required settings
	// see https://github.com/taskcluster/generic-worker#set-up-your-env
	set("rootURL", state.RootURL)
	set("clientId", state.Credentials.ClientID)
	set("accessToken", state.Credentials.AccessToken)
	set("workerId", state.WorkerID)
	set("workerType", splitWorkerPoolID[1])

	// optional settings
	set("workerGroup", state.WorkerGroup)
	if state.Credentials.Certificate != "" {
		set("certificate", state.Credentials.Certificate)
	}
	set("provisionerId", splitWorkerPoolID[0][:len(splitWorkerPoolID[0])-1])

	return nil
}

func (d *genericworker) UseCachedRun(state *run.State) error {
	return nil
}

func (d *genericworker) StartWorker(state *run.State) (protocol.Transport, error) {
	// write out the config file
	content, err := json.MarshalIndent(state.WorkerConfig, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("Error constructing worker config: %v", err)
	}
	err = ioutil.WriteFile(d.wicfg.ConfigPath, content, 0600)
	if err != nil {
		return nil, fmt.Errorf("Error writing worker config to %s: %v", d.wicfg.ConfigPath, err)
	}

	transp := protocol.NewStdioTransport()

	// path to generic-worker binary
	cmd := exec.Command(d.wicfg.Path)
	cmd.Env = os.Environ()
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	// pass config to generic-worker
	cmd.Args = append(cmd.Args, "run", "--config", d.wicfg.ConfigPath)

	d.cmd = cmd

	// Unfortunately, cmd.Wait does not handle the case where cmd.Stdin is a writer that remains
	// open when the process exits.  Instead, we set up our own copy loop.  This loop in fact
	// runs forever, but for a single-use process like this, that's OK.
	pipe, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	go func() {
		_, err = io.Copy(pipe, transp)
		if err != nil {
			// this can occur when the worker exits while we are trying to send a
			// message to it, so we will consider the message lost and shut down
			// as usual.
			log.Printf("Error writing to worker process (ignored): %#v", err)
		}
	}()

	err = cmd.Start()
	if err != nil {
		return nil, err
	}

	return transp, nil
}

func (d *genericworker) SetProtocol(proto *protocol.Protocol) {
}

func (d *genericworker) Wait() error {
	return d.cmd.Wait()
}

func New(runnercfg *cfg.RunnerConfig) (worker.Worker, error) {
	rv := genericworker{runnercfg, genericworkerConfig{}, nil}
	err := runnercfg.WorkerImplementation.Unpack(&rv.wicfg)
	if err != nil {
		return nil, err
	}
	return &rv, nil
}

func Usage() string {
	return `

The "generic-worker" worker implementation starts generic-worker
(https://github.com/taskcluster/generic-worker).  It takes the following
values in the 'worker' section of the runner configuration:

	worker:
		implementation: generic-worker
		# path to the root of the generic-worker executable
		# can also be a wrapper script to which args will be passed
		path: /usr/local/bin/generic-worker
		# path where taskcluster-worker-runner should write the generated
		# generic-worker configuration.
		configPath: /etc/taskcluster/generic-worker/config.yaml

`
}
