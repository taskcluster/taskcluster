package credexp

import (
	"log"
	"time"

	"github.com/taskcluster/taskcluster/v30/internal/workerproto"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/run"
)

// An object to manage expiration of the credentials by informing the worker
type CredExp struct {
	state *run.State

	// the protocol (set in SetProtocol)
	proto *workerproto.Protocol

	// a timer to handle sending a graceful-termination request before
	// the credentials expire
	credsExpireTimer *time.Timer
}

func New(state *run.State) *CredExp {
	return &CredExp{state, nil, nil}
}

func (ce *CredExp) SetProtocol(proto *workerproto.Protocol) {
	ce.proto = proto
	proto.AddCapability("graceful-termination")
}

func (ce *CredExp) WorkerStarted() error {
	// gracefully terminate the worker when the credentials expire, if they expire
	if ce.state.CredentialsExpire.IsZero() {
		return nil
	}

	untilExpire := time.Until(ce.state.CredentialsExpire)
	ce.credsExpireTimer = time.AfterFunc(untilExpire-30*time.Second, func() {
		if ce.proto != nil && ce.proto.Capable("graceful-termination") {
			log.Println("Taskcluster Credentials are expiring in 30s; stopping worker")
			ce.proto.Send(workerproto.Message{
				Type: "graceful-termination",
				Properties: map[string]interface{}{
					// credentials are expiring, so no time to shut down..
					"finish-tasks": false,
				},
			})
		}
	})
	return nil
}

func (ce *CredExp) WorkerFinished() error {
	if ce.credsExpireTimer != nil {
		ce.credsExpireTimer.Stop()
		ce.credsExpireTimer = nil
	}
	return nil
}
