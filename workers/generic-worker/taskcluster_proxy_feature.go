package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/taskcluster/slugid-go/slugid"
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
	taskclusterProxyPort     uint16 // task-facing port (reverse proxy or direct)
	internalProxyPort        uint16 // real proxy port (behind reverse proxy, capacity > 1 only)
	secret                   string
	reverseProxy             *http.Server
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
	// Get allocated task-facing port, fall back to config default
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

	// include all scopes from task.scopes, as well as the scope to create artifacts on
	// this task (which cannot be represented in task.scopes)
	scopes := append(l.task.TaskClaimResponse.Task.Scopes,
		fmt.Sprintf("queue:create-artifact:%s/%d", l.task.TaskID, l.task.RunID))

	creds := &tcclient.Credentials{
		AccessToken:      l.task.TaskClaimResponse.Credentials.AccessToken,
		Certificate:      l.task.TaskClaimResponse.Credentials.Certificate,
		ClientID:         l.task.TaskClaimResponse.Credentials.ClientID,
		AuthorizedScopes: scopes,
	}

	if config.Capacity > 1 {
		return l.startWithReverseProxy(proxyPort, creds)
	}
	return l.startDirect(proxyPort, creds)
}

// startDirect starts the proxy directly on the task-facing port (capacity == 1).
// No secret, no reverse proxy — existing behavior.
func (l *TaskclusterProxyTask) startDirect(proxyPort uint16, creds *tcclient.Credentials) *CommandExecutionError {
	taskclusterProxy, err := tcproxy.New(
		config.TaskclusterProxyExecutable,
		l.taskclusterProxyAddress,
		proxyPort,
		config.RootURL,
		creds,
		"",
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

// startWithReverseProxy starts the real proxy on an internal port with Bearer
// auth, and runs an in-process reverse proxy on the task-facing port that
// transparently injects the Authorization header. This prevents cross-task
// proxy access when capacity > 1 without requiring any task-side changes.
func (l *TaskclusterProxyTask) startWithReverseProxy(taskFacingPort uint16, creds *tcclient.Credentials) *CommandExecutionError {
	internalPort, ok := l.task.TaskclusterProxyInternalPort()
	if !ok {
		return executionError(internalError, errored, fmt.Errorf("no internal proxy port allocated for task %s", l.task.TaskID))
	}

	secret := slugid.Nice()
	l.secret = secret
	l.internalProxyPort = internalPort

	// Start the real proxy on the internal port with Bearer auth
	taskclusterProxy, err := tcproxy.New(
		config.TaskclusterProxyExecutable,
		l.taskclusterProxyAddress,
		internalPort,
		config.RootURL,
		creds,
		secret,
	)
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("could not start taskcluster proxy on internal port %d: %s", internalPort, err))
	}
	l.taskclusterProxy = taskclusterProxy
	l.taskclusterProxyPort = taskFacingPort

	// Start the in-process reverse proxy on the task-facing port.
	// It injects the Bearer token so tasks don't need to know the secret.
	targetURL, _ := url.Parse(fmt.Sprintf("http://%s:%d", l.taskclusterProxyAddress, internalPort))
	proxy := httputil.NewSingleHostReverseProxy(targetURL)
	proxy.FlushInterval = 100 * time.Millisecond

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Header.Set("Authorization", "Bearer "+secret)
		proxy.ServeHTTP(w, r)
	})

	listenAddr := l.taskclusterProxyAddress + ":" + strconv.Itoa(int(taskFacingPort))
	listener, err := net.Listen("tcp", listenAddr)
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("could not listen on %s for reverse proxy: %s", listenAddr, err))
	}

	server := &http.Server{Handler: handler}
	l.reverseProxy = server
	go func() {
		_ = server.Serve(listener)
	}()

	err = l.task.setVariable("TASKCLUSTER_PROXY_URL",
		fmt.Sprintf("http://%s:%d", l.taskclusterProxyAddress, taskFacingPort))
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
			// PUT credentials directly to the real proxy. For capacity > 1,
			// this goes to the internal port with the Bearer header.
			var putURL string
			if l.secret != "" {
				putURL = fmt.Sprintf("http://%s:%v/credentials", l.taskclusterProxyAddress, l.internalProxyPort)
			} else {
				putURL = fmt.Sprintf("http://%s:%v/credentials", l.taskclusterProxyAddress, l.taskclusterProxyPort)
			}
			req, err := http.NewRequest("PUT", putURL, buffer)
			if err != nil {
				panic(fmt.Sprintf("Could not create PUT request to taskcluster-proxy /credentials endpoint: %v", err))
			}
			if l.secret != "" {
				req.Header.Set("Authorization", "Bearer "+l.secret)
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
	if l.reverseProxy != nil {
		if closeErr := l.reverseProxy.Close(); closeErr != nil {
			l.task.Warnf("[taskcluster-proxy] Could not close reverse proxy: %s", closeErr)
		}
	}
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
