package runner

import (
	"log"
	"time"

	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/files"
	"github.com/taskcluster/taskcluster-worker-runner/protocol"
	taskcluster "github.com/taskcluster/taskcluster/clients/client-go/v14"
)

// Run represents all of the information required to run the worker.  Its
// contents are built up bit-by-bit during the start-worker process.
type Run struct {
	// Information about the Taskcluster deployment where this
	// worker is runing
	RootURL string

	// Credentials for the worker, and their expiration time.  Shortly before
	// this expiration, worker-runner will try to gracefully stop the worker
	Credentials       taskcluster.Credentials
	CredentialsExpire time.Time

	// Information about this worker
	WorkerPoolID string
	WorkerGroup  string
	WorkerID     string

	// metadata from the provider (useful to display to the user for
	// debugging).  Workers should not *require* any data to exist
	// in this map, and where possible should just pass it along as-is
	// in worker config as helpful debugging metadata for the user.
	ProviderMetadata map[string]string

	// the accumulated WorkerConfig for this run, including files to create
	WorkerConfig *cfg.WorkerConfig
	Files        []files.File

	// the protocol (set in SetProtocol)
	proto *protocol.Protocol

	// a timer to handle sending a graceful-termination request before
	// the credentials expire
	credsExpireTimer *time.Timer
}

func (r *Run) SetProtocol(proto *protocol.Protocol) {
	r.proto = proto
}

func (r *Run) WorkerStarted() error {
	// gracefully terminate the worker when the credentials expire, if they expire
	if r.CredentialsExpire.IsZero() {
		return nil
	}

	untilExpire := time.Until(r.CredentialsExpire)
	r.credsExpireTimer = time.AfterFunc(untilExpire-30*time.Second, func() {
		if r.proto != nil && r.proto.Capable("graceful-termination") {
			log.Println("Taskcluster Credentials are expiring in 30s; stopping worker")
			r.proto.Send(protocol.Message{
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

func (r *Run) WorkerFinished() error {
	if r.credsExpireTimer != nil {
		r.credsExpireTimer.Stop()
		r.credsExpireTimer = nil
	}
	return nil
}
