package mocktc

import (
	"net/http"

	"github.com/gorilla/mux"
	"github.com/taskcluster/taskcluster/v99/clients/client-go/tcworkermanager"
	"github.com/taskcluster/taskcluster/v99/internal/mocktc/tc"
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
	s.HandleFunc("/worker/reregister", wp.ReregisterWorker).Methods("POST")
	s.HandleFunc("/workers/{workerPoolId}/{workerGroup}/{workerId}", wp.RemoveWorker).Methods("DELETE")
	s.HandleFunc("/worker-pool-errors/{workerPoolId}", wp.ReportWorkerError).Methods("POST")
	s.HandleFunc("/worker-pool/{workerPoolId}", wp.WorkerPool).Methods("GET")
	s.HandleFunc("/worker-pool/{workerPoolId}", wp.CreateWorkerPool).Methods("PUT")
	s.HandleFunc("/workers/{workerPoolId}/{workerGroup}/{workerId}/should-terminate", wp.ShouldWorkerTerminate).Methods("GET")
	s.HandleFunc("/providers", wp.ListProviders).Methods("GET")
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

func (wp *WorkerManagerProvider) ShouldWorkerTerminate(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	out, err := wp.workerManager.ShouldWorkerTerminate(vars["workerPoolId"], vars["workerGroup"], vars["workerId"])
	JSON(w, out, err)
}

func (wp *WorkerManagerProvider) ReregisterWorker(w http.ResponseWriter, r *http.Request) {
	var payload tcworkermanager.ReregisterWorkerRequest
	Marshal(r, &payload)
	out, err := wp.workerManager.ReregisterWorker(&payload)
	JSON(w, out, err)
}

func (wp *WorkerManagerProvider) RemoveWorker(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	err := wp.workerManager.RemoveWorker(vars["workerPoolId"], vars["workerGroup"], vars["workerId"])
	JSON(w, nil, err)
}

func (wp *WorkerManagerProvider) ReportWorkerError(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	var payload tcworkermanager.WorkerErrorReport
	Marshal(r, &payload)
	out, err := wp.workerManager.ReportWorkerError(vars["workerPoolId"], &payload)
	JSON(w, out, err)
}

func (wp *WorkerManagerProvider) ListProviders(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	out, err := wp.workerManager.ListProviders(vars["continuationToken"], vars["limit"])
	JSON(w, out, err)
}
