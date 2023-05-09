package dockerworker

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/util"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/worker/worker"
	"github.com/taskcluster/taskcluster/v50/tools/workerproto"
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
	state.Lock()
	defer state.Unlock()

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

func (d *dockerworker) StartWorker(state *run.State) (workerproto.Transport, error) {
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

	// the --host worker-runner instructs docker-worker to merge
	// config from $DOCKER_WORKER_CONFIG.
	args := []string{"--host", "worker-runner", "production"}

	// Support the `bin/docker-worker` script in the docker-worker tarball format,
	// falling back to the old repo format if that is not found
	var cmd *exec.Cmd
	dwScript := filepath.Join(d.wicfg.Path, "bin", "docker-worker")
	if _, err := os.Stat(dwScript); os.IsNotExist(err) {
		// fall back to running the old path-to-repo format
		mainJs := fmt.Sprintf("%s/src/bin/worker.js", d.wicfg.Path)
		args = append([]string{mainJs}, args...)
		cmd = exec.Command("node", args...)
	} else {
		cmd = exec.Command(dwScript, args...)
	}
	cmd.Env = os.Environ()
	cmd.Env = append(cmd.Env, "DOCKER_WORKER_CONFIG="+d.wicfg.ConfigPath)
	cmd.Stderr = os.Stderr
	d.cmd = cmd

	cmdStdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	cmdStdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	transp := workerproto.NewPipeTransport(cmdStdout, cmdStdin)

	err = cmd.Start()
	if err != nil {
		return nil, err
	}

	if err = util.DisableOOM(cmd.Process.Pid); err != nil {
		log.Printf("Error disabling OOM killer for the docker-worker process: %v", err)
	}

	return transp, nil
}

func (d *dockerworker) SetProtocol(proto *workerproto.Protocol) {
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
(https://github.com/taskcluster/taskcluster/tree/main/workers/docker-worker). It takes the following
values in the 'worker' section of the runner configuration:

` + "```yaml" + `
worker:
    implementation: docker-worker
    # path to the 'docker-worker' directory from the docker-worker release tarball
    path: /path/to/docker-worker
    # path where worker-runner should write the generated
    # docker-worker configuration.
    configPath: ..
` + "```" + `
`
}
