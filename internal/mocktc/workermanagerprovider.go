package mocktc

import (
	"net/http"

	"github.com/gorilla/mux"
	"github.com/taskcluster/taskcluster/v95/clients/client-go/tcworkermanager"
	"github.com/taskcluster/taskcluster/v95/internal/mocktc/tc"
)

type WorkerManagerProvider struct {
	workerManager tc.WorkerManager
}

func NewWorkerManagerProvider(workerManager tc.WorkerManager) *WorkerManagerProvider {
	return &WorkerManagerProvider{
		workerManager: workerManager,
	}
}

func (wp *WorkerManagerProvider) RegisterService(r *mux.Router) {
	s := r.PathPrefix("/api/worker-manager/v1").Subrouter()
	s.HandleFunc("/worker/register", wp.RegisterWorker).Methods("POST")
	s.HandleFunc("/worker-pool/{workerPoolId}", wp.WorkerPool).Methods("GET")
	s.HandleFunc("/worker-pool/{workerPoolId}", wp.CreateWorkerPool).Methods("PUT")
}

func (wp *WorkerManagerProvider) RegisterWorker(w http.ResponseWriter, r *http.Request) {
	var payload tcworkermanager.RegisterWorkerRequest
	Marshal(r, &payload)
	out, err := wp.workerManager.RegisterWorker(&payload)
	JSON(w, out, err)
}

func (wp *WorkerManagerProvider) WorkerPool(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	out, err := wp.workerManager.WorkerPool(vars["workerPoolId"])
	JSON(w, out, err)
}

func (wp *WorkerManagerProvider) CreateWorkerPool(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	var payload tcworkermanager.WorkerPoolDefinition
	Marshal(r, &payload)
	out, err := wp.workerManager.CreateWorkerPool(vars["workerPoolId"], &payload)
	JSON(w, out, err)
}
