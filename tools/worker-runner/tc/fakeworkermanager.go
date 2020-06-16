package tc

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v30/clients/client-go"
	"github.com/taskcluster/taskcluster/v30/clients/client-go/tcworkermanager"
)

var (
	wmRegistrations          []*tcworkermanager.RegisterWorkerRequest
	wmWorkerErrorReports     []*tcworkermanager.WorkerErrorReport
	wmWorkerErrorReportsLock sync.Mutex
)

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

	return &tcworkermanager.RegisterWorkerResponse{
		Credentials: tcworkermanager.Credentials{
			ClientID:    "testing",
			AccessToken: "at",
			Certificate: "cert",
		},
		Expires:      tcclient.Time(time.Now()),
		WorkerConfig: wc,
	}, nil
}

func (wm *FakeWorkerManager) RemoveWorker(workerPoolID, workerGroup, workerID string) error {
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

// A function matching WorkerManagerClientFactory that can be used in testing
func FakeWorkerManagerClientFactory(rootURL string, credentials *tcclient.Credentials) (WorkerManager, error) {
	return &FakeWorkerManager{authenticated: credentials != nil}, nil
}
