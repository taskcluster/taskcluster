package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"

	tcclient "github.com/taskcluster/taskcluster/v96/clients/client-go"
	"github.com/taskcluster/taskcluster/v96/internal/scopes"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/host"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/tcproxy"
)

type TaskclusterProxyFeature struct {
}

func (feature *TaskclusterProxyFeature) Name() string {
	return "Taskcluster Proxy"
}

func (feature *TaskclusterProxyFeature) Initialise() error {
	return nil
}

func (feature *TaskclusterProxyFeature) IsEnabled() bool {
	return config.EnableTaskclusterProxy
}

func (feature *TaskclusterProxyFeature) IsRequested(task *TaskRun) bool {
	return task.Payload.Features.TaskclusterProxy
}

type TaskclusterProxyTask struct {
	taskclusterProxy         *tcproxy.TaskclusterProxy
	task                     *TaskRun
	taskStatusChangeListener *TaskStatusChangeListener
	taskclusterProxyAddress  string
	taskclusterProxyPort     uint16
	dockerNetwork            string // per-task Docker network name (d2g only)
}

func (l *TaskclusterProxyTask) ReservedArtifacts() []string {
	return []string{}
}

func (feature *TaskclusterProxyFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &TaskclusterProxyTask{
		task: task,
	}
}

func (l *TaskclusterProxyTask) RequiredScopes() scopes.Required {
	// let's not require any scopes, to be consistent with docker-worker
	return scopes.Required{}
}

func (l *TaskclusterProxyTask) Start() *CommandExecutionError {
	// Get allocated port, fall back to config default
	proxyPort, ok := l.task.TaskclusterProxyPort()
	if !ok {
		proxyPort = config.TaskclusterProxyPort
	}

	switch l.task.Payload.TaskclusterProxyInterface {
	case "docker-bridge":
		// Create a per-task Docker network for isolation. Each container
		// will only be able to reach its own tc-proxy instance.
		networkName := fmt.Sprintf("gw-task-%s-%d", l.task.TaskID[:12], l.task.RunID)
		_, err := host.Output("docker", "network", "create", networkName)
		if err != nil {
			return executionError(internalError, errored, fmt.Errorf("could not create Docker network %s: %s", networkName, err))
		}
		l.dockerNetwork = networkName

		// Get the gateway IP of the new network
		out, err := host.Output("docker", "network", "inspect", networkName, "--format", "{{range .IPAM.Config}}{{if .Gateway}}{{.Gateway}} {{end}}{{end}}")
		if err != nil {
			return executionError(internalError, errored, fmt.Errorf("could not determine gateway for Docker network %s: %s", networkName, err))
		}
		gateways := strings.Split(strings.TrimSpace(out), " ")
		for _, v := range gateways {
			ipAddress := net.ParseIP(v)
			if ipAddress == nil || ipAddress.To4() == nil {
				continue
			}
			l.taskclusterProxyAddress = v
			break
		}
		if l.taskclusterProxyAddress == "" {
			return executionError(internalError, errored, fmt.Errorf("no IPv4 gateway found for Docker network %s among %v", networkName, gateways))
		}

		// Make the network name and gateway available to d2g for docker run
		err = l.task.setVariable("TASKCLUSTER_DOCKER_NETWORK", networkName)
		if err != nil {
			return MalformedPayloadError(err)
		}
		err = l.task.setVariable("TASKCLUSTER_PROXY_GATEWAY", l.taskclusterProxyAddress)
		if err != nil {
			return MalformedPayloadError(err)
		}
	case "localhost":
		l.taskclusterProxyAddress = "127.0.0.1"
	default:
		return executionError(internalError, errored, fmt.Errorf("INTERNAL BUG: Unsupported taskcluster proxy interface enum option should not have made it here: %q", l.task.Payload.TaskclusterProxyInterface))
	}

	// include all scopes from task.scopes, as well as the scope to create artifacts on
	// this task (which cannot be represented in task.scopes)
	taskScopes := append(l.task.TaskClaimResponse.Task.Scopes,
		fmt.Sprintf("queue:create-artifact:%s/%d", l.task.TaskID, l.task.RunID))

	creds := &tcclient.Credentials{
		AccessToken:      l.task.TaskClaimResponse.Credentials.AccessToken,
		Certificate:      l.task.TaskClaimResponse.Credentials.Certificate,
		ClientID:         l.task.TaskClaimResponse.Credentials.ClientID,
		AuthorizedScopes: taskScopes,
	}

	// For native tasks in multiuser mode, use --allowed-user for UID
	// verification. For d2g tasks, the per-task Docker network provides
	// isolation instead. In insecure mode, Context.User is nil (no
	// separate task users), so no UID verification is possible.
	allowedUser := ""
	if l.dockerNetwork == "" && l.task.Context.User != nil {
		allowedUser = l.task.Context.User.Name
	}

	taskclusterProxy, err := tcproxy.New(
		config.TaskclusterProxyExecutable,
		l.taskclusterProxyAddress,
		proxyPort,
		config.RootURL,
		creds,
		allowedUser,
	)
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("could not start taskcluster proxy on port %d: %s", proxyPort, err))
	}
	l.taskclusterProxy = taskclusterProxy
	l.taskclusterProxyPort = proxyPort

	err = l.task.setVariable("TASKCLUSTER_PROXY_URL",
		fmt.Sprintf("http://%s:%d", l.taskclusterProxyAddress, proxyPort))
	if err != nil {
		return MalformedPayloadError(err)
	}

	l.registerCredentialRefresh()
	return nil
}

// registerCredentialRefresh sets up a listener that refreshes proxy credentials
// when a task is reclaimed.
func (l *TaskclusterProxyTask) registerCredentialRefresh() {
	l.taskStatusChangeListener = &TaskStatusChangeListener{
		Name: "taskcluster-proxy",
		Callback: func(ts TaskStatus) {
			log.Printf("Received task status change: %v", ts)
			if ts != reclaimed {
				return
			}
			newCreds := l.task.TaskReclaimResponse.Credentials
			b, err := json.Marshal(&newCreds)
			if err != nil {
				panic(err)
			}
			buffer := bytes.NewBuffer(b)
			putURL := fmt.Sprintf("http://%s:%v/credentials", l.taskclusterProxyAddress, l.taskclusterProxyPort)
			req, err := http.NewRequest("PUT", putURL, buffer)
			if err != nil {
				panic(fmt.Sprintf("Could not create PUT request to taskcluster-proxy /credentials endpoint: %v", err))
			}
			client := &http.Client{}
			res, err := client.Do(req)
			if err != nil {
				panic(fmt.Sprintf("Could not PUT to %v: %v", putURL, err))
			}
			defer res.Body.Close()
			if res.StatusCode != 200 {
				panic(fmt.Sprintf("Got http status code %v when issuing PUT to %v", res.StatusCode, putURL))
			}
			log.Printf("Got http status code %v when issuing PUT to %v with clientId %v", res.StatusCode, putURL, newCreds.ClientID)
			l.task.Infof("[taskcluster-proxy] Successfully refreshed taskcluster-proxy credentials: %v", newCreds.ClientID)
		},
	}
	l.task.StatusManager.RegisterListener(l.taskStatusChangeListener)
}

func (l *TaskclusterProxyTask) Stop(err *ExecutionErrors) {
	l.task.StatusManager.DeregisterListener(l.taskStatusChangeListener)
	if l.taskclusterProxy != nil {
		if errTerminate := l.taskclusterProxy.Terminate(); errTerminate != nil {
			l.task.Warnf("[taskcluster-proxy] Could not terminate taskcluster proxy process: %s", errTerminate)
			log.Printf("WARNING: could not terminate taskcluster proxy writer: %s", errTerminate)
		}
	}
	if l.dockerNetwork != "" {
		if _, rmErr := host.Output("docker", "network", "rm", l.dockerNetwork); rmErr != nil {
			l.task.Warnf("[taskcluster-proxy] Could not remove Docker network %s: %s", l.dockerNetwork, rmErr)
		}
	}
}
