package genericworker

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/worker/worker"
	"github.com/taskcluster/taskcluster/v50/tools/workerproto"
)

type genericworkerConfig struct {
	Path         string `workerimpl:",optional"`
	Service      string `workerimpl:",optional"`
	ProtocolPipe string `workerimpl:",optional"`
	ConfigPath   string
}

type genericworker struct {
	runnercfg *cfg.RunnerConfig
	wicfg     genericworkerConfig
	runMethod runMethod
}

func (d *genericworker) ConfigureRun(state *run.State) error {
	state.Lock()
	defer state.Unlock()

	var err error

	// copy some values from the provider metadata, if they are set; if not,
	// generic-worker will fall back to defaults
	for cfg, md := range map[string]string{
		// generic-worker config : providerMetadata
		"publicIP":         "public-ipv4",
		"privateIP":        "local-ipv4",
		"instanceType":     "instance-type",
		"instanceID":       "instance-id",
		"region":           "region",
		"availabilityZone": "availability-zone",
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

	// merge provider metadata into workerTypeMetadata property
	c, err := cfg.NewWorkerConfig().Set("workerTypeMetadata", state.ProviderMetadata)
	if err != nil {
		panic(err)
	}
	state.WorkerConfig = state.WorkerConfig.Merge(c)

	// split to workerType and provisionerId
	splitWorkerPoolID := strings.SplitAfterN(state.WorkerPoolID, "/", 2)

	// ensure that the workerPoolID has a slash in it
	if len(splitWorkerPoolID) != 2 {
		return fmt.Errorf("workerPoolID %q does not contain a slash", state.WorkerPoolID)
	}

	// required settings
	// see https://docs.taskcluster.net/docs/reference/workers/generic-worker/installing#set-up-your-env
	set("rootURL", state.RootURL)
	set("clientId", state.Credentials.ClientID)
	set("accessToken", state.Credentials.AccessToken)
	set("provisionerId", splitWorkerPoolID[0][:len(splitWorkerPoolID[0])-1])
	set("workerType", splitWorkerPoolID[1])
	set("workerGroup", state.WorkerGroup)
	set("workerId", state.WorkerID)

	// optional settings
	if state.Credentials.Certificate != "" {
		set("certificate", state.Credentials.Certificate)
	}

	return nil
}

func (d *genericworker) UseCachedRun(state *run.State) error {
	return nil
}

func (d *genericworker) StartWorker(state *run.State) (workerproto.Transport, error) {
	state.Lock()
	defer state.Unlock()

	// write out the config file
	content, err := json.MarshalIndent(state.WorkerConfig, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("Error constructing worker config: %v", err)
	}
	err = os.WriteFile(d.wicfg.ConfigPath, content, 0600)
	if err != nil {
		return nil, fmt.Errorf("Error writing worker config to %s: %v", d.wicfg.ConfigPath, err)
	}

	if (d.wicfg.Path != "" && d.wicfg.Service != "") || (d.wicfg.Path == "" && d.wicfg.Service == "") {
		return nil, fmt.Errorf("Specify exactly one of worker.path and worker.windowsService")
	}
	if d.wicfg.Path != "" {
		d.runMethod, err = newCmdRunMethod()
	} else {
		d.runMethod, err = newServiceRunMethod()
	}
	if err != nil {
		return nil, err
	}

	return d.runMethod.start(d, state)
}

func (d *genericworker) SetProtocol(proto *workerproto.Protocol) {
}

func (d *genericworker) Wait() error {
	return d.runMethod.wait()
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
	return strings.ReplaceAll(`

The "generic-worker" worker implementation starts generic-worker
(https://github.com/taskcluster/taskcluster/workers/generic-worker). It takes the following
values in the 'worker' section of the runner configuration:

`+"```yaml"+`
worker:
	implementation: generic-worker
	# path to the root of the generic-worker executable
	# can also be a wrapper script to which args will be passed
	path: /usr/local/bin/generic-worker
	# (Windows only) service name to start
	service: "Generic Worker"
	# (Windows only) named pipe (\\.\pipe\<something>) with which generic-worker
	# will communicate with worker-runner; default value is as shown here:
	protocolPipe: \\.\pipe\generic-worker
	# path where worker-runner should write the generated
	# generic-worker configuration.
	configPath: /etc/taskcluster/generic-worker/config.yaml
`+"```"+`

On Linux, specify only |implementation|, |path|, and |configPath|.

On Windows, worker-runner can start generic-worker in two ways: as a service, or as a child process.

To run generic-worker as a service, specify |implementation|, |service| and |configPath|, and ensure that the |configPath| matches the |--config| path configured within the service definition.
See [Deployment](/docs/reference/workers/worker-runner/deployment).
In most cases, |protocolPipe| can be omitted to use the default value.
This would only need to be overridden if multiple copies of generic-worker are running on the same host.

To run generic-worker as a child process, specify |implementation|, |path| and |configPath|.
In this case, |protocolPipe| is not used.
`, "|", "`")
}
