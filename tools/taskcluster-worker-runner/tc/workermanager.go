package tc

import (
	tcclient "github.com/taskcluster/taskcluster/v25/clients/client-go"
	"github.com/taskcluster/taskcluster/v25/clients/client-go/tcworkermanager"
)

// An interface containing the functions required of WorkerManager, allowing
// use of fakes that also match this interface.
type WorkerManager interface {
	RegisterWorker(payload *tcworkermanager.RegisterWorkerRequest) (*tcworkermanager.RegisterWorkerResponse, error)
}

// A factory type that can create new instances of the WorkerManager interface.
type WorkerManagerClientFactory func(rootURL string, credentials *tcclient.Credentials) (WorkerManager, error)
