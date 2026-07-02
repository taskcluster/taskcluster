package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"

	tcclient "github.com/taskcluster/taskcluster/v101/clients/client-go"
	"github.com/taskcluster/taskcluster/v101/internal/scopes"
	"github.com/taskcluster/taskcluster/v101/workers/generic-worker/host"
	"github.com/taskcluster/taskcluster/v101/workers/generic-worker/tcproxy"
)

type TaskclusterProxyFeature struct {
}

func (feature *TaskclusterProxyFeature) Name() string {
	return "Taskcluster Proxy"
}

func (feature *TaskclusterProxyFeature) Initialise() error {
	// Sweep stale per-task Docker networks and containers from prior
	// worker incarnations. A SIGKILL / OOM / crash leaves the
	// gw-task-* network and any attached taskcontainer_* container on
	// the Docker host; the bridge network IPAM pool exhausts after
	// ~30 leaked entries (default config), at which point new networks
	// fail to create. Containers must be removed before networks
	// because containers hold network references.
	//
	// The sweep is gated on D2GEnabled() — only D2G tasks create these
	// resources, and the gate avoids invoking docker on workers that
	// don't have it installed.
	if config.D2GEnabled() {
		sweepStaleDockerResources()
	}
	return nil
}

// sweepStaleDockerResources removes leaked taskcontainer_* containers
// and gw-task-* networks created by prior worker runs.
func sweepStaleDockerResources() {
	out, _ := host.Output("docker", "ps", "-aq", "--filter", "name=taskcontainer_")
	for c := range strings.FieldsSeq(out) {
		if rmOut, err := host.Output("docker", "rm", "-f", c); err != nil {
			log.Printf("startup: could not remove stale container %s: %s (output: %s)", c, err, rmOut)
		}
	}
	out, _ = host.Output("docker", "network", "ls", "--filter", "name=gw-task-", "--format", "{{.Name}}")
	for n := range strings.FieldsSeq(out) {
		if rmOut, err := host.Output("docker", "network", "rm", n); err != nil {
			log.Printf("startup: could not remove stale docker network %s: %s (output: %s)", n, err, rmOut)
		}
	}
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
	dockerSubnet             string // per-task Docker network subnet, CIDR (d2g only)
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

		// Pull both the gateway IP (for the proxy to bind to) and the
		// subnet (so tc-proxy can admit in-container traffic by remote
		// IP) in one inspect call. Format emits "<gateway> <subnet>"
		// per IPAM.Config entry, separated by newlines.
		out, err := host.Output("docker", "network", "inspect", networkName, "--format", "{{range .IPAM.Config}}{{if and .Gateway .Subnet}}{{.Gateway}} {{.Subnet}}{{println}}{{end}}{{end}}")
		if err != nil {
			return executionError(internalError, errored, fmt.Errorf("could not determine gateway/subnet for Docker network %s: %s", networkName, err))
		}
		var dockerSubnet string
		for line := range strings.SplitSeq(strings.TrimSpace(out), "\n") {
			fields := strings.Fields(line)
			if len(fields) != 2 {
				continue
			}
			gw, subnet := fields[0], fields[1]
			ipAddress := net.ParseIP(gw)
			if ipAddress == nil || ipAddress.To4() == nil {
				continue
			}
			l.taskclusterProxyAddress = gw
			dockerSubnet = subnet
			break
		}
		if l.taskclusterProxyAddress == "" {
			return executionError(internalError, errored, fmt.Errorf("no IPv4 gateway found for Docker network %s in %q", networkName, out))
		}
		l.dockerSubnet = dockerSubnet

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

	// Connection admission for tc-proxy:
	//
	//   - --allowed-user: enforces that the OS-level peer of an
	//     accepted connection (resolved via /proc/net/tcp on Linux,
	//     lsof on darwin, GetExtendedTcpTable on Windows) is the
	//     task user. Set whenever Context.User is non-nil (i.e. on
	//     the multiuser engine).
	//
	//   - --allowed-network: a fallback admission rule used only
	//     when the peer-credential lookup CANNOT find the connecting
	//     socket. That happens specifically when the peer is in a
	//     different network namespace — e.g. a process inside a
	//     d2g + docker-bridge container whose client socket lives in
	//     the container's netns and is not visible in the proxy's
	//     /proc/net/tcp. We pass the per-task Docker subnet here so
	//     that legitimate in-container traffic to the bridge gateway
	//     IP is admitted by remote-IP membership.
	//
	// Combined, these two flags close the mixed-engine + capacity > 1
	// security gap: a sibling native task's host process IS visible
	// in /proc/net/tcp (host netns), so its UID is found and checked
	// against allowed-user — even if its source IP happens to fall
	// inside the docker subnet. The networkAdmittingVerifier only
	// admits-by-network when UID lookup explicitly returns
	// errPeerNotFound; UID mismatches still reject.
	//
	// In insecure mode, Context.User is nil (no separate task users),
	// so no UID verification is possible and we pass neither flag —
	// even on docker-bridge — because allowed-network without
	// allowed-user would put the proxy in a network-only mode we
	// don't currently support, and insecure capacity > 1 is
	// explicitly out of scope (no isolation goal anyway).
	allowedUser := ""
	allowedNetwork := ""
	if l.task.Context.User != nil {
		allowedUser = l.task.Context.User.Name
		allowedNetwork = l.dockerSubnet
	}

	taskclusterProxy, err := tcproxy.New(
		config.TaskclusterProxyExecutable,
		l.taskclusterProxyAddress,
		proxyPort,
		config.RootURL,
		creds,
		allowedUser,
		allowedNetwork,
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
			// When the proxy is bound to a docker-bridge gateway IP,
			// the worker (which lives in the host netns) talks to the
			// proxy's loopback companion listener on 127.0.0.1. That
			// keeps the control-plane request out of the routing/NAT
			// path used for container traffic, so the proxy's UID
			// admission has a clean /proc/net/tcp entry to verify
			// against. tc-proxy binds 127.0.0.1 in addition to the
			// configured ip-address whenever --allowed-network is set.
			refreshHost := l.taskclusterProxyAddress
			if l.dockerSubnet != "" {
				refreshHost = "127.0.0.1"
			}
			putURL := fmt.Sprintf("http://%s:%v/credentials", refreshHost, l.taskclusterProxyPort)
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
