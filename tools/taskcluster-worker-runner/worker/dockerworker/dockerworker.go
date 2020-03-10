package dockerworker

import (
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"os"
	"os/exec"
	"strings"

	"github.com/taskcluster/taskcluster/v27/tools/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v27/tools/taskcluster-worker-runner/protocol"
	"github.com/taskcluster/taskcluster/v27/tools/taskcluster-worker-runner/run"
	"github.com/taskcluster/taskcluster/v27/tools/taskcluster-worker-runner/worker/worker"
)

type dockerworkerConfig struct {
	Path       string
	ConfigPath string
}

type dockerworker struct {
	runnercfg *cfg.RunnerConfig
	wicfg     dockerworkerConfig
	cmd       *exec.Cmd
}

func (d *dockerworker) ConfigureRun(state *run.State) error {
	var err error

	// copy some values from the provisioner metadata, if they are set; if not,
	// docker-worker will fall back to defaults
	for cfg, md := range map[string]string{
		// docker-worker config : providerMetadata
		"host":           "public-hostname",
		"publicIp":       "public-ipv4",
		"privateIp":      "local-ipv4",
		"workerNodeType": "instance-type",
		"instanceType":   "instance-type",
		"instanceId":     "instance-id",
		"region":         "region",
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

	workerLocationJson, err := json.Marshal(state.WorkerLocation)
	if err != nil {
		return fmt.Errorf("Error encoding worker location: %v", err)
	}

	state.WorkerConfig, err = state.WorkerConfig.Set("workerLocation", string(workerLocationJson))
	if err != nil {
		return fmt.Errorf("Could not set worker location in the worker config: %v", err)
	}

	set := func(key, value string) {
		var err error
		// only programming errors can cause this to fail
		state.WorkerConfig, err = state.WorkerConfig.Set(key, value)
		if err != nil {
			panic(err)
		}
	}

	set("rootUrl", state.RootURL)
	set("taskcluster.clientId", state.Credentials.ClientID)
	set("taskcluster.accessToken", state.Credentials.AccessToken)
	if state.Credentials.Certificate != "" {
		set("taskcluster.certificate", state.Credentials.Certificate)
	}

	set("workerId", state.WorkerID)
	set("workerGroup", state.WorkerGroup)

	workerPoolID := strings.SplitAfterN(state.WorkerPoolID, "/", 2)
	set("provisionerId", workerPoolID[0][:len(workerPoolID[0])-1])
	set("workerType", workerPoolID[1])

	return nil
}

func (d *dockerworker) UseCachedRun(state *run.State) error {
	return nil
}

func (d *dockerworker) StartWorker(state *run.State) (protocol.Transport, error) {
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

	// the --host taskcluster-worker-runner instructs docker-worker to merge
	// config from $DOCKER_WORKER_CONFIG.
	mainJs := fmt.Sprintf("%s/src/bin/worker.js", d.wicfg.Path)
	cmd := exec.Command("node", mainJs, "--host", "taskcluster-worker-runner", "production")
	cmd.Env = os.Environ()
	cmd.Env = append(cmd.Env, "DOCKER_WORKER_CONFIG="+d.wicfg.ConfigPath)
	cmd.Stdout = transp
	cmd.Stderr = os.Stderr
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

func (d *dockerworker) SetProtocol(proto *protocol.Protocol) {
}

func (d *dockerworker) Wait() error {
	return d.cmd.Wait()
}

func New(runnercfg *cfg.RunnerConfig) (worker.Worker, error) {
	rv := dockerworker{runnercfg, dockerworkerConfig{}, nil}
	err := runnercfg.WorkerImplementation.Unpack(&rv.wicfg)
	if err != nil {
		return nil, err
	}
	return &rv, nil
}

func Usage() string {
	return `

The "docker-worker" worker implementation starts docker-worker
(https://github.com/taskcluster/docker-worker).  It takes the following
values in the 'worker' section of the runner configuration:

` + "```yaml" + `
worker:
    implementation: docker-worker
    # path to the root of the docker-worker repo clone
    path: /path/to/docker-worker/repo
    # path where taskcluster-worker-runner should write the generated
    # docker-worker configuration.
    configPath: ..
` + "```" + `
`
}
