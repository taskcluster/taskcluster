package tc

import (
	tcclient "github.com/taskcluster/taskcluster/v50/clients/client-go"
	"github.com/taskcluster/taskcluster/v50/clients/client-go/tcworkermanager"
)

// An interface containing the functions required of WorkerManager, allowing
// use of fakes that also match this interface.
type WorkerManager interface {
	RegisterWorker(payload *tcworkermanager.RegisterWorkerRequest) (*tcworkermanager.RegisterWorkerResponse, error)
	ReportWorkerError(workerPoolID string, payload *tcworkermanager.WorkerErrorReport) (*tcworkermanager.WorkerPoolError, error)
	ReregisterWorker(payload *tcworkermanager.ReregisterWorkerRequest) (*tcworkermanager.ReregisterWorkerResponse, error)
	RemoveWorker(workerPoolID, workerGroup, workerID string) error
}

// A factory type that can create new instances of the WorkerManager interface.
type WorkerManagerClientFactory func(rootURL string, credentials *tcclient.Credentials) (WorkerManager, error)
