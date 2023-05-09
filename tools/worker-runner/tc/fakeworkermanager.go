package tc

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/taskcluster/slugid-go/slugid"
	tcclient "github.com/taskcluster/taskcluster/v50/clients/client-go"
	"github.com/taskcluster/taskcluster/v50/clients/client-go/tcworkermanager"
)

var (
	wmWorkerErrorReports     []*tcworkermanager.WorkerErrorReport
	wmWorkerErrorReportsLock sync.Mutex

	wmRegistrations   []*tcworkermanager.RegisterWorkerRequest
	wmReregistrations []*tcworkermanager.ReregisterWorkerRequest
	wmWorkerRemovals  []*removedWorker

	// the time at which credentials from regitsterWorker and reregsiterWorker will expire
	workerExpires tcclient.Time

	// the secret reregisterWorker will look for.  This is set by registerWorker but can
	// also be manipulated by test code
	workerSecret string
)

type removedWorker struct {
	WorkerPoolID string
	WorkerGroup  string
	WorkerID     string
}

type FakeWorkerManager struct {
	authenticated bool
}

func (wm *FakeWorkerManager) RegisterWorker(payload *tcworkermanager.RegisterWorkerRequest) (*tcworkermanager.RegisterWorkerResponse, error) {
	if wm.authenticated {
		return nil, fmt.Errorf("must use an unauthenticated client to register")
	}

	wc := json.RawMessage(`{
        "whateverWorker": {
		    "config": {
				"from-register-worker": true
			},
			"files": [
			    {"description": "a file."}
			]
		}
	}`)

	wmRegistrations = append(wmRegistrations, payload)

	workerSecret = slugid.V4()

	return &tcworkermanager.RegisterWorkerResponse{
		Credentials: tcworkermanager.Credentials{
			ClientID:    "testing",
			AccessToken: "at",
			Certificate: "cert",
		},
		Expires:      workerExpires,
		Secret:       workerSecret,
		WorkerConfig: wc,
	}, nil
}

func (wm *FakeWorkerManager) ReregisterWorker(payload *tcworkermanager.ReregisterWorkerRequest) (*tcworkermanager.ReregisterWorkerResponse, error) {
	if !wm.authenticated {
		return nil, fmt.Errorf("must use an authenticated client to reregister")
	}

	if payload.Secret != workerSecret {
		return nil, fmt.Errorf("secret does not match fake workerSecret")
	}

	wmReregistrations = append(wmReregistrations, payload)

	workerSecret = slugid.V4()

	return &tcworkermanager.ReregisterWorkerResponse{
		Credentials: tcworkermanager.Credentials1{
			ClientID:    "testing-rereg",
			AccessToken: "at-rereg",
			Certificate: "cert-rereg",
		},
		Expires: workerExpires,
		Secret:  workerSecret,
	}, nil
}

func (wm *FakeWorkerManager) RemoveWorker(workerPoolID, workerGroup, workerID string) error {
	wmWorkerRemovals = append(wmWorkerRemovals, &removedWorker{
		WorkerPoolID: workerPoolID,
		WorkerGroup:  workerGroup,
		WorkerID:     workerID,
	})
	return nil
}

func (wm *FakeWorkerManager) ReportWorkerError(workerPoolID string, payload *tcworkermanager.WorkerErrorReport) (*tcworkermanager.WorkerPoolError, error) {
	workerPoolError := tcworkermanager.WorkerPoolError{
		Description:  payload.Description,
		Extra:        payload.Extra,
		ErrorID:      "1",
		Kind:         payload.Kind,
		Reported:     tcclient.Time(time.Date(2009, time.November, 10, 23, 0, 0, 0, time.UTC)),
		WorkerPoolID: workerPoolID,
	}
	wmWorkerErrorReportsLock.Lock()
	defer wmWorkerErrorReportsLock.Unlock()
	wmWorkerErrorReports = append(wmWorkerErrorReports, payload)
	return &workerPoolError, nil
}

func FakeWorkerManagerWorkerErrorReports() ([]*tcworkermanager.WorkerErrorReport, error) {
	wmWorkerErrorReportsLock.Lock()
	defer wmWorkerErrorReportsLock.Unlock()
	if len(wmWorkerErrorReports) == 0 {
		return nil, fmt.Errorf("No reportWorkerError calls")
	} else {
		reports := make([]*tcworkermanager.WorkerErrorReport, len(wmWorkerErrorReports))
		copy(reports, wmWorkerErrorReports)
		wmWorkerErrorReports = []*tcworkermanager.WorkerErrorReport{}
		return reports, nil
	}
}

// Get the single registration that has occurred, or an error if there are not
// exactly one.  This resets the list of registrations in the process.
func FakeWorkerManagerRegistration() (*tcworkermanager.RegisterWorkerRequest, error) {
	if len(wmRegistrations) == 0 {
		return nil, fmt.Errorf("No registerWorker calls")
	} else if len(wmRegistrations) == 1 {
		req := wmRegistrations[0]
		wmRegistrations = []*tcworkermanager.RegisterWorkerRequest{}
		return req, nil
	} else {
		return nil, fmt.Errorf("Multiple registerWorker calls")
	}
}

// Get the single reregistration that has occurred, or an error if there are not
// exactly one.  This resets the list of registrations in the process.
func FakeWorkerManagerReregistration() (*tcworkermanager.ReregisterWorkerRequest, error) {
	if len(wmReregistrations) == 0 {
		return nil, fmt.Errorf("No reregisterWorker calls")
	} else if len(wmReregistrations) == 1 {
		req := wmReregistrations[0]
		wmReregistrations = []*tcworkermanager.ReregisterWorkerRequest{}
		return req, nil
	} else {
		return nil, fmt.Errorf("Multiple reregisterWorker calls")
	}
}

// Get the worker removals that have occurred.
func FakeWorkerManagerWorkerRemovals() []*removedWorker {
	req := wmWorkerRemovals
	wmWorkerRemovals = []*removedWorker{}
	return req
}

func SetFakeWorkerManagerWorkerExpires(expires tcclient.Time) {
	workerExpires = expires
}

func SetFakeWorkerManagerWorkerSecret(secret string) {
	workerSecret = secret
}

func GetFakeWorkerManagerWorkerSecret() string {
	return workerSecret
}

// A function matching WorkerManagerClientFactory that can be used in testing
func FakeWorkerManagerClientFactory(rootURL string, credentials *tcclient.Credentials) (WorkerManager, error) {
	return &FakeWorkerManager{authenticated: credentials != nil}, nil
}
