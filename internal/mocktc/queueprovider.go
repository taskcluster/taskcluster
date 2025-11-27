package mocktc

import (
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/taskcluster/taskcluster/v94/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v94/internal/mocktc/tc"
)

type QueueProvider struct {
	queue tc.Queue
}

func NewQueueProvider(queue tc.Queue) *QueueProvider {
	return &QueueProvider{
		queue: queue,
	}
}

func (qp *QueueProvider) RegisterService(r *mux.Router) {
	s := r.PathPrefix("/api/queue/v1").Subrouter()
	s.HandleFunc("/claim-work/{taskQueueId}", qp.ClaimWork).Methods("POST")
	s.HandleFunc("/task/{taskId}/runs/{runId}/artifacts/{name}", qp.CreateArtifact).Methods("POST")
	s.HandleFunc("/task/{taskId}", qp.CreateTask).Methods("PUT")
	s.HandleFunc("/task/{taskId}/artifacts/{name}", qp.GetLatestArtifact_SignedURL).Methods("GET")
	// TODO: currently mocks don't support more than one task run per task - and all assume runId == "0"
	s.HandleFunc("/task/{taskId}/runs/{runId}/artifacts/{name}", qp.GetLatestArtifact_SignedURL).Methods("GET")
	s.HandleFunc("/task/{taskId}/runs/{runId}/artifacts/{name}", qp.FinishArtifact).Methods("PUT")
	s.HandleFunc("/task/{taskId}/runs/{runId}/artifacts", qp.ListArtifacts).Methods("GET")
	s.HandleFunc("/task/{taskId}/runs/{runId}/artifact-content/{name}", qp.Artifact).Methods("GET")
	s.HandleFunc("/task/{taskId}/artifact-content/{name}", qp.LatestArtifact).Methods("GET")
	s.HandleFunc("/task/{taskId}/runs/{runId}/reclaim", qp.ReclaimTask).Methods("POST")
	s.HandleFunc("/task/{taskId}/runs/{runId}/completed", qp.ReportCompleted).Methods("POST")
	s.HandleFunc("/task/{taskId}/runs/{runId}/exception", qp.ReportException).Methods("POST")
	s.HandleFunc("/task/{taskId}/runs/{runId}/failed", qp.ReportFailed).Methods("POST")
	s.HandleFunc("/task/{taskId}/status", qp.Status).Methods("GET")
	s.HandleFunc("/task/{taskId}", qp.Task).Methods("GET")
	s.HandleFunc("/task/{taskId}/cancel", qp.CancelTask).Methods("POST")
}

func (qp *QueueProvider) ClaimWork(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	var payload tcqueue.ClaimWorkRequest
	Marshal(r, &payload)
	out, err := qp.queue.ClaimWork(vars["taskQueueId"], &payload)
	JSON(w, out, err)
}

func (qp *QueueProvider) CreateArtifact(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	var payload tcqueue.PostArtifactRequest
	Marshal(r, &payload)
	out, err := qp.queue.CreateArtifact(vars["taskId"], vars["runId"], vars["name"], &payload)
	JSON(w, out, err)
}

func (qp *QueueProvider) FinishArtifact(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	var payload tcqueue.FinishArtifactRequest
	Marshal(r, &payload)
	err := qp.queue.FinishArtifact(vars["taskId"], vars["runId"], vars["name"], &payload)
	JSON(w, map[string]string{}, err)
}

func (qp *QueueProvider) CreateTask(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	var payload tcqueue.TaskDefinitionRequest
	Marshal(r, &payload)
	out, err := qp.queue.CreateTask(vars["taskId"], &payload)
	JSON(w, out, err)
}

func (qp *QueueProvider) GetLatestArtifact_SignedURL(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	location, err := qp.queue.GetLatestArtifact_SignedURL(vars["taskId"], vars["name"], 1*time.Hour)
	if err != nil {
		ReportError(w, err)
		return
	}
	http.Redirect(w, r, location.String(), http.StatusFound)
}

func (qp *QueueProvider) ListArtifacts(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	out, err := qp.queue.ListArtifacts(vars["taskId"], vars["runId"], vars["continuationToken"], vars["limit"])
	JSON(w, out, err)
}

func (qp *QueueProvider) Artifact(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	out, err := qp.queue.Artifact(vars["taskId"], vars["runId"], vars["name"])
	if err != nil {
		ReportError(w, err)
		return
	}
	JSON(w, out, err)
}

func (qp *QueueProvider) LatestArtifact(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	out, err := qp.queue.LatestArtifact(vars["taskId"], vars["name"])
	if err != nil {
		ReportError(w, err)
		return
	}
	JSON(w, out, err)
}

func (qp *QueueProvider) ReclaimTask(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	out, err := qp.queue.ReclaimTask(vars["taskId"], vars["runId"])
	JSON(w, out, err)
}

func (qp *QueueProvider) ReportCompleted(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	out, err := qp.queue.ReportCompleted(vars["taskId"], vars["runId"])
	JSON(w, out, err)
}

func (qp *QueueProvider) ReportException(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	var payload tcqueue.TaskExceptionRequest
	Marshal(r, &payload)
	out, err := qp.queue.ReportException(vars["taskId"], vars["runId"], &payload)
	JSON(w, out, err)
}

func (qp *QueueProvider) ReportFailed(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	out, err := qp.queue.ReportFailed(vars["taskId"], vars["runId"])
	JSON(w, out, err)
}

func (qp *QueueProvider) Status(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	out, err := qp.queue.Status(vars["taskId"])
	JSON(w, out, err)
}

func (qp *QueueProvider) Task(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	out, err := qp.queue.Task(vars["taskId"])
	JSON(w, out, err)
}

func (qp *QueueProvider) CancelTask(w http.ResponseWriter, r *http.Request) {
	vars := Vars(r)
	out, err := qp.queue.CancelTask(vars["taskId"])
	JSON(w, out, err)
}
