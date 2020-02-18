package tc

import (
	"fmt"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v25/clients/client-go"
	"github.com/taskcluster/taskcluster/v25/clients/client-go/tcworkermanager"
)

var (
	wmRegistrations []*tcworkermanager.RegisterWorkerRequest
)

type FakeWorkerManager struct {
	authenticated bool
}

func (wm *FakeWorkerManager) RegisterWorker(payload *tcworkermanager.RegisterWorkerRequest) (*tcworkermanager.RegisterWorkerResponse, error) {
	if wm.authenticated {
		return nil, fmt.Errorf("must use an unauthenticated client to register")
	}

	wmRegistrations = append(wmRegistrations, payload)

	return &tcworkermanager.RegisterWorkerResponse{
		Credentials: tcworkermanager.Credentials{
			ClientID:    "testing",
			AccessToken: "at",
			Certificate: "cert",
		},
		Expires: tcclient.Time(time.Now()),
	}, nil
}

// Get the single registration that has occurred, or an error if there are not
// exactly one.  This resets the list of registrations in the process.
func FakeWorkerManagerRegistration() (*tcworkermanager.RegisterWorkerRequest, error) {
	if len(wmRegistrations) == 0 {
		return nil, fmt.Errorf("No registerWorker calls")
	} else if len(wmRegistrations) == 1 {
		return wmRegistrations[0], nil
	} else {
		return nil, fmt.Errorf("Multiple registerWorker calls")
	}
}

// A function matching WorkerManagerClientFactory that can be used in testing
func FakeWorkerManagerClientFactory(rootURL string, credentials *tcclient.Credentials) (WorkerManager, error) {
	return &FakeWorkerManager{authenticated: credentials != nil}, nil
}
