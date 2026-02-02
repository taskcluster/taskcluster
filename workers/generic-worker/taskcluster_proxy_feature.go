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
	// Get allocated port for this task, fall back to config default
	proxyPort, ok := l.task.TaskclusterProxyPort()
	if !ok {
		proxyPort = config.TaskclusterProxyPort
	}

	switch l.task.Payload.TaskclusterProxyInterface {
	case "docker-bridge":
		out, err := host.Output("docker", "network", "inspect", "bridge", "--format", "{{range .IPAM.Config}}{{if .Gateway}}{{.Gateway}} {{end}}{{end}}")
		if err != nil {
			return executionError(internalError, errored, fmt.Errorf("could not determine docker bridge IP address: %s", err))
		}
		gateways := strings.Split(strings.TrimSpace(out), " ")
		if len(gateways) == 0 {
			return executionError(internalError, errored, fmt.Errorf("could not determine docker bridge IP address: no gateways found"))
		}
		for _, v := range gateways {
			ipAddress := net.ParseIP(v)
			if ipAddress == nil {
				continue
			}
			if ipAddress.To4() == nil {
				continue
			}
			l.taskclusterProxyAddress = v
			break
		}
		if l.taskclusterProxyAddress == "" {
			return executionError(internalError, errored, fmt.Errorf("could not determine docker bridge IP address: no ipv4 gateway found among %v", gateways))
		}
	case "localhost":
		l.taskclusterProxyAddress = "127.0.0.1"
	default:
		return executionError(internalError, errored, fmt.Errorf("INTERNAL BUG: Unsupported taskcluster proxy interface enum option should not have made it here: %q", l.task.Payload.TaskclusterProxyInterface))
	}

	// Set TASKCLUSTER_PROXY_URL in the task environment
	err := l.task.setVariable("TASKCLUSTER_PROXY_URL",
		fmt.Sprintf("http://%s:%d", l.taskclusterProxyAddress, proxyPort))
	if err != nil {
		return MalformedPayloadError(err)
	}

	// include all scopes from task.scopes, as well as the scope to create artifacts on
	// this task (which cannot be represented in task.scopes)
	scopes := append(l.task.TaskClaimResponse.Task.Scopes,
		fmt.Sprintf("queue:create-artifact:%s/%d", l.task.TaskID, l.task.RunID))
	taskclusterProxy, err := tcproxy.New(
		config.TaskclusterProxyExecutable,
		l.taskclusterProxyAddress,
		proxyPort,
		config.RootURL,
		&tcclient.Credentials{
			AccessToken:      l.task.TaskClaimResponse.Credentials.AccessToken,
			Certificate:      l.task.TaskClaimResponse.Credentials.Certificate,
			ClientID:         l.task.TaskClaimResponse.Credentials.ClientID,
			AuthorizedScopes: scopes,
		},
	)
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("could not start taskcluster proxy on port %d: %s", proxyPort, err))
	}
	l.taskclusterProxy = taskclusterProxy
	l.taskclusterProxyPort = proxyPort
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
	return nil
}

func (l *TaskclusterProxyTask) Stop(err *ExecutionErrors) {
	l.task.StatusManager.DeregisterListener(l.taskStatusChangeListener)
	if l.taskclusterProxy == nil {
		return
	}
	errTerminate := l.taskclusterProxy.Terminate()
	if errTerminate != nil {
		// no need to raise an exception, machine will reboot anyway
		l.task.Warnf("[taskcluster-proxy] Could not terminate taskcluster proxy process: %s", errTerminate)
		log.Printf("WARNING: could not terminate taskcluster proxy writer: %s", errTerminate)
	}
}
