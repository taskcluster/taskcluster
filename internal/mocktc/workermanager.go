package mocktc

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/taskcluster/httpbackoff/v3"
	"github.com/taskcluster/slugid-go/slugid"
	tcclient "github.com/taskcluster/taskcluster/v96/clients/client-go"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcworkermanager"
)

type WorkerManager struct {
	// workerPools["<workerPoolId>"]
	workerPools map[string]*tcworkermanager.WorkerPoolFullDefinition

	mu                   sync.Mutex
	shouldTerminateCalls int
}

// ShouldTerminateAfterNCalls controls when ShouldWorkerTerminate returns
// Terminate: true. 0 means never terminate (default). N > 0 means return
// true starting at the Nth call.
var ShouldTerminateAfterNCalls int

func NewWorkerManager(t *testing.T) *WorkerManager {
	t.Helper()
	return &WorkerManager{
		workerPools: map[string]*tcworkermanager.WorkerPoolFullDefinition{},
	}
}

func (wm *WorkerManager) RegisterWorker(payload *tcworkermanager.RegisterWorkerRequest) (*tcworkermanager.RegisterWorkerResponse, error) {
	d := json.NewDecoder(bytes.NewBuffer(payload.WorkerIdentityProof))
	d.DisallowUnknownFields()
	g := tcworkermanager.AwsProviderType{}
	err := d.Decode(&g)
	if err != nil {
		return nil, &tcclient.APICallException{
			CallSummary: &tcclient.CallSummary{
				HTTPResponseBody: err.Error(),
			},
			RootCause: httpbackoff.BadHttpResponseCode{
				HttpResponseCode: 400,
			},
		}
	}
	if g.Signature != "test-signature" {
		return nil, &tcclient.APICallException{
			CallSummary: &tcclient.CallSummary{
				HTTPResponseBody: fmt.Sprintf("Got signature %q but was expecting %q", g.Signature, "test-signature"),
			},
			RootCause: httpbackoff.BadHttpResponseCode{
				HttpResponseCode: 400,
			},
		}
	}
	return &tcworkermanager.RegisterWorkerResponse{
		Credentials: tcworkermanager.Credentials{
			ClientID:    "fake-client-id",
			Certificate: "fake-cert",
			AccessToken: slugid.Nice(),
		},
	}, nil
}

func (wm *WorkerManager) WorkerPool(workerPoolId string) (*tcworkermanager.WorkerPoolFullDefinition, error) {
	return wm.workerPools[workerPoolId], nil
}

func (wm *WorkerManager) CreateWorkerPool(workerPoolId string, payload *tcworkermanager.WorkerPoolDefinition) (*tcworkermanager.WorkerPoolFullDefinition, error) {
	wpfd := &tcworkermanager.WorkerPoolFullDefinition{
		Config:       payload.Config,
		Created:      tcclient.Time(time.Now()),
		Description:  payload.Description,
		EmailOnError: payload.EmailOnError,
		LastModified: tcclient.Time(time.Now()),
		Owner:        payload.Owner,
		ProviderID:   payload.ProviderID,
		WorkerPoolID: workerPoolId,
	}
	wm.workerPools[workerPoolId] = wpfd
	return wpfd, nil
}

func (wm *WorkerManager) ShouldWorkerTerminate(workerPoolId, workerGroup, workerId string) (*tcworkermanager.ShouldWorkerTerminateResponse, error) {
	wm.mu.Lock()
	wm.shouldTerminateCalls++
	calls := wm.shouldTerminateCalls
	wm.mu.Unlock()

	terminate := ShouldTerminateAfterNCalls > 0 && calls >= ShouldTerminateAfterNCalls
	reason := "no reason"
	if terminate {
		reason = "over_capacity"
	}
	return &tcworkermanager.ShouldWorkerTerminateResponse{
		Reason:    reason,
		Terminate: terminate,
	}, nil
}
