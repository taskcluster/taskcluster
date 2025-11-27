package mocktc

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/taskcluster/httpbackoff/v3"
	"github.com/taskcluster/slugid-go/slugid"
	tcclient "github.com/taskcluster/taskcluster/v94/clients/client-go"
	"github.com/taskcluster/taskcluster/v94/clients/client-go/tcqueue"
)

type Queue struct {
	mu sync.RWMutex
	t  *testing.T

	// orderedTasks stores FIFO sorted taskIds since `range q.tasks` returns
	// taskIds in an arbitrary order
	orderedTasks []string

	// tasks["<taskId>"]
	tasks map[string]*tcqueue.TaskDefinitionAndStatus

	// artifacts["<taskId>:<runId>"]["<name>"]
	artifacts map[string]map[string]any

	baseURL string
}

func NewQueue(t *testing.T, baseURL string) *Queue {
	t.Helper()
	return &Queue{
		t:         t,
		tasks:     map[string]*tcqueue.TaskDefinitionAndStatus{},
		artifacts: map[string]map[string]any{},
		baseURL:   baseURL,
	}
}

/////////////////////////////////////////////////

func (queue *Queue) CancelTask(taskId string) (*tcqueue.TaskStatusResponse, error) {
	err := queue.ensureRunning(taskId, "0")
	if err != nil {
		return nil, err
	}
	queue.mu.Lock()
	queue.tasks[taskId].Status.Runs[0].ReasonResolved = "canceled"
	queue.tasks[taskId].Status.Runs[0].State = "exception"
	queue.mu.Unlock()
	return queue.Status(taskId)
}

func (queue *Queue) ClaimWork(taskQueueId string, payload *tcqueue.ClaimWorkRequest) (*tcqueue.ClaimWorkResponse, error) {
	queue.mu.Lock()
	defer queue.mu.Unlock()
	maxTasks := payload.Tasks
	tasks := []tcqueue.TaskClaim{}
	for _, taskId := range queue.orderedTasks {
		j := queue.tasks[taskId]

		if j.Task.TaskQueueID == taskQueueId && j.Status.State == "pending" {
			j.Status.State = "running"
			j.Status.Runs = []tcqueue.RunInformation{
				{
					RunID:         0,
					ReasonCreated: "scheduled",
					State:         "running",
				},
			}
			tasks = append(
				tasks,
				tcqueue.TaskClaim{
					Task:   j.Task,
					Status: j.Status,
					Credentials: tcqueue.TaskCredentials{
						ClientID:    "test-task-client-id",
						AccessToken: "test-task-access-token",
					},
				},
			)
			if len(tasks) == int(maxTasks) {
				break
			}
		}
	}
	return &tcqueue.ClaimWorkResponse{
		Tasks: tasks,
	}, nil
}

func (queue *Queue) ensureArtifactMap(taskId, runId string) {
	if _, mapAlreadyCreated := queue.artifacts[taskId+":"+runId]; !mapAlreadyCreated {
		queue.artifacts[taskId+":"+runId] = map[string]any{}
	}
}

func (queue *Queue) CreateArtifact(taskId, runId, name string, payload *tcqueue.PostArtifactRequest) (*tcqueue.PostArtifactResponse, error) {
	queue.mu.Lock()
	defer queue.mu.Unlock()

	queue.ensureArtifactMap(taskId, runId)

	var request tcqueue.Artifact
	err := json.Unmarshal([]byte(*payload), &request)
	if err != nil {
		queue.t.Fatalf("Error unmarshalling from json: %v", err)
	}

	var req, resp any
	switch request.StorageType {
	case "s3":
		var s3Request tcqueue.S3ArtifactRequest
		err = json.Unmarshal([]byte(*payload), &s3Request)
		if err != nil {
			queue.t.Fatalf("Error unmarshalling S3 Artifact Request from json: %v", err)
		}
		req = &s3Request
		resp, err = queue.createS3Artifact(taskId, runId, name, &s3Request)
	case "object":
		var objectRequest tcqueue.ObjectArtifactRequest
		err = json.Unmarshal([]byte(*payload), &objectRequest)
		if err != nil {
			queue.t.Fatalf("Error unmarshalling Object Artifact Request from json: %v", err)
		}
		req = &objectRequest
		resp, err = queue.createObjectArtifact(taskId, runId, name, &objectRequest)
	case "error":
		var errorRequest tcqueue.ErrorArtifactRequest
		err = json.Unmarshal([]byte(*payload), &errorRequest)
		if err != nil {
			queue.t.Fatalf("Error unmarshalling Error Artifact Request from json: %v", err)
		}
		req = &errorRequest
		resp, err = queue.createErrorArtifact(taskId, runId, name, &errorRequest)
	case "reference":
		var redirectRequest tcqueue.RedirectArtifactRequest
		err = json.Unmarshal([]byte(*payload), &redirectRequest)
		if err != nil {
			queue.t.Fatalf("Error unmarshalling Redirect Artifact Request from json: %v", err)
		}
		req = &redirectRequest
		resp, err = queue.createRedirectArtifact(taskId, runId, name, &redirectRequest)
	case "link":
		var linkRequest tcqueue.LinkArtifactRequest
		err = json.Unmarshal([]byte(*payload), &linkRequest)
		if err != nil {
			queue.t.Fatalf("Error unmarshalling Link Artifact Request from json: %v", err)
		}
		req = &linkRequest
		resp, err = queue.createLinkArtifact(taskId, runId, name, &linkRequest)
	default:
		queue.t.Fatalf("Unrecognised storage type: %v", request.StorageType)
	}

	if err != nil {
		return nil, err
	}

	queue.artifacts[taskId+":"+runId][name] = req

	var par tcqueue.PostArtifactResponse
	par, err = json.Marshal(resp)
	if err != nil {
		queue.t.Fatalf("Error marshalling into json: %v", err)
	}
	return &par, nil
}

func (queue *Queue) FinishArtifact(taskId, runId, name string, payload *tcqueue.FinishArtifactRequest) error {
	queue.mu.Lock()
	defer queue.mu.Unlock()

	// do nothing (for now)
	return nil
}

func (queue *Queue) ensureUnchangedIfAlreadyExists(taskId, runId, name string, request any) error {
	previousVersion, existed := queue.artifacts[taskId+":"+runId][name]
	if !existed || reflect.DeepEqual(previousVersion, request) {
		return nil
	}
	return &tcclient.APICallException{
		CallSummary: &tcclient.CallSummary{
			HTTPResponseBody: fmt.Sprintf("Request conflict: artifact %v in taskId %v and runId %v exists with different values: disallowing update %v -> %v", name, taskId, runId, previousVersion, request),
		},
		RootCause: httpbackoff.BadHttpResponseCode{
			HttpResponseCode: 409,
		},
	}
}

func (queue *Queue) createObjectArtifact(taskId, runId, name string, objectRequest *tcqueue.ObjectArtifactRequest) (*tcqueue.ObjectArtifactResponse, error) {
	err := queue.ensureUnchangedIfAlreadyExists(taskId, runId, name, objectRequest)
	if err != nil {
		return nil, err
	}
	return &tcqueue.ObjectArtifactResponse{
		Expires:     objectRequest.Expires,
		Name:        name,
		ProjectID:   "test-project",
		UploadID:    slugid.Nice(),
		StorageType: objectRequest.StorageType,
	}, nil
}

func (queue *Queue) createS3Artifact(taskId, runId, name string, s3Request *tcqueue.S3ArtifactRequest) (*tcqueue.S3ArtifactResponse, error) {
	err := queue.ensureUnchangedIfAlreadyExists(taskId, runId, name, s3Request)
	if err != nil {
		return nil, err
	}
	return &tcqueue.S3ArtifactResponse{
		ContentType: s3Request.ContentType,
		Expires:     s3Request.Expires,
		PutURL:      "http://localhost:13243/s3/" + url.PathEscape(taskId) + "/" + url.PathEscape(runId) + "/" + url.PathEscape(name),
		StorageType: s3Request.StorageType,
	}, nil
}

func (queue *Queue) createErrorArtifact(taskId, runId, name string, errorRequest *tcqueue.ErrorArtifactRequest) (*tcqueue.ErrorArtifactResponse, error) {
	err := queue.ensureUnchangedIfAlreadyExists(taskId, runId, name, errorRequest)
	if err != nil {
		return nil, err
	}
	return &tcqueue.ErrorArtifactResponse{
		StorageType: errorRequest.StorageType,
	}, nil
}

func (queue *Queue) createRedirectArtifact(taskId, runId, name string, redirectRequest *tcqueue.RedirectArtifactRequest) (*tcqueue.RedirectArtifactResponse, error) {
	previousVersion, existed := queue.artifacts[taskId+":"+runId][name]
	if !existed {
		return &tcqueue.RedirectArtifactResponse{
			StorageType: redirectRequest.StorageType,
		}, nil
	}
	if _, wasRedirect := previousVersion.(*tcqueue.RedirectArtifactRequest); wasRedirect {
		// new reference artifact allowed with different URL / Content Type / Expiry
		return &tcqueue.RedirectArtifactResponse{
			StorageType: redirectRequest.StorageType,
		}, nil
	}
	return nil, &tcclient.APICallException{
		CallSummary: &tcclient.CallSummary{
			HTTPResponseBody: fmt.Sprintf("Request conflict: redirect artifact %v in taskId %v and runId %v cannot replace a non-redirect artifact: disallowing update %v -> %v", name, taskId, runId, previousVersion, redirectRequest),
		},
		RootCause: httpbackoff.BadHttpResponseCode{
			HttpResponseCode: 409,
		},
	}
}

func (queue *Queue) createLinkArtifact(taskId, runId, name string, linkRequest *tcqueue.LinkArtifactRequest) (*tcqueue.LinkArtifactResponse, error) {
	previousVersion, existed := queue.artifacts[taskId+":"+runId][name]
	if !existed {
		return &tcqueue.LinkArtifactResponse{
			StorageType: linkRequest.StorageType,
		}, nil
	}
	// check that this is only replacing a redirect artifact (queue permits other changes, but
	// this is the critical change for generic-worker)
	if _, wasRedir := previousVersion.(*tcqueue.RedirectArtifactRequest); wasRedir {
		// new link artifact is allowed to replace a reference/redirect artifact
		return &tcqueue.LinkArtifactResponse{
			StorageType: linkRequest.StorageType,
		}, nil
	}
	return nil, &tcclient.APICallException{
		CallSummary: &tcclient.CallSummary{
			HTTPResponseBody: fmt.Sprintf("Request conflict: link artifact %v in taskId %v and runId %v cannot replace a non-redirect artifact: disallowing update %v -> %v", name, taskId, runId, previousVersion, linkRequest),
		},
		RootCause: httpbackoff.BadHttpResponseCode{
			HttpResponseCode: 409,
		},
	}
}

func (queue *Queue) CreateTask(taskId string, payload *tcqueue.TaskDefinitionRequest) (*tcqueue.TaskStatusResponse, error) {
	queue.mu.Lock()
	defer queue.mu.Unlock()

	// The real queue treats incoming json `null` and `[]` values for lists as
	// `[]`, so let's do the same for dependencies, routes and scopes...

	if payload.Dependencies == nil {
		payload.Dependencies = []string{}
	}
	if payload.Routes == nil {
		payload.Routes = []string{}
	}
	if payload.Scopes == nil {
		payload.Scopes = []string{}
	}

	// Handle different possible cases with taskQueueId and provisionerId/workerType
	var provisionerId, workerType, taskQueueId string
	if payload.ProvisionerID != "" && payload.WorkerType != "" && payload.TaskQueueID != "" {
		if fmt.Sprintf("%s/%s", payload.ProvisionerID, payload.WorkerType) != payload.TaskQueueID {
			panic("taskQueueId must match \"provisionerId/workerType\"")
		} else {
			provisionerId = payload.ProvisionerID
			workerType = payload.WorkerType
			taskQueueId = payload.TaskQueueID
		}
	} else if payload.ProvisionerID != "" && payload.WorkerType != "" {
		provisionerId = payload.ProvisionerID
		workerType = payload.WorkerType
		taskQueueId = fmt.Sprintf("%s/%s", payload.ProvisionerID, payload.WorkerType)
	} else if payload.TaskQueueID != "" {
		splitId := strings.Split(payload.TaskQueueID, "/")
		provisionerId = splitId[0]
		workerType = splitId[1]
		taskQueueId = payload.TaskQueueID
	} else {
		panic("at least a provisionerId and a workerType or a taskQueueId must be provided")
	}

	queue.tasks[taskId] = &tcqueue.TaskDefinitionAndStatus{
		Status: tcqueue.TaskStatusStructure{
			TaskID: taskId,
			State:  "pending",
		},
		Task: tcqueue.TaskDefinitionResponse{
			Created:       payload.Created,
			Deadline:      payload.Deadline,
			Dependencies:  payload.Dependencies,
			Expires:       payload.Expires,
			Extra:         payload.Extra,
			Metadata:      payload.Metadata,
			Payload:       payload.Payload,
			Priority:      payload.Priority,
			ProvisionerID: provisionerId,
			Requires:      payload.Requires,
			Retries:       payload.Retries,
			Routes:        payload.Routes,
			SchedulerID:   payload.SchedulerID,
			Scopes:        payload.Scopes,
			Tags:          payload.Tags,
			TaskGroupID:   payload.TaskGroupID,
			TaskQueueID:   taskQueueId,
			WorkerType:    workerType,
		},
	}
	tsr := &tcqueue.TaskStatusResponse{
		Status: tcqueue.TaskStatusStructure{
			Deadline:      payload.Deadline,
			Expires:       payload.Expires,
			ProvisionerID: provisionerId,
			RetriesLeft:   payload.Retries,
			Runs:          []tcqueue.RunInformation{},
			SchedulerID:   payload.SchedulerID,
			State:         "pending",
			TaskGroupID:   payload.TaskGroupID,
			TaskID:        taskId,
			TaskQueueID:   taskQueueId,
			WorkerType:    workerType,
		},
	}
	queue.orderedTasks = append(queue.orderedTasks, taskId)
	return tsr, nil
}

func (queue *Queue) GetLatestArtifact_SignedURL(taskId, name string, duration time.Duration) (*url.URL, error) {
	queue.mu.RLock()
	defer queue.mu.RUnlock()
	taskRunArtifacts, exists := queue.artifacts[taskId+":0"]
	if !exists {
		return nil, &tcclient.APICallException{
			CallSummary: &tcclient.CallSummary{
				HTTPResponseBody: fmt.Sprintf("No artifacts for task %v (runId 0) found", taskId),
			},
			RootCause: httpbackoff.BadHttpResponseCode{
				HttpResponseCode: 404,
			},
		}
	}
	artifact, exists := taskRunArtifacts[name]
	if !exists {
		return nil, &tcclient.APICallException{
			CallSummary: &tcclient.CallSummary{
				HTTPResponseBody: fmt.Sprintf("Task %v (runId 0) found, but does not have artifact %v", taskId, name),
			},
			RootCause: httpbackoff.BadHttpResponseCode{
				HttpResponseCode: 404,
			},
		}
	}
	switch a := artifact.(type) {
	case *tcqueue.S3ArtifactRequest:
		return url.Parse("http://localhost:13243/s3/" + url.PathEscape(taskId) + "/0/" + url.PathEscape(name))
	case *tcqueue.ErrorArtifactRequest:
		return nil, nil
	case *tcqueue.RedirectArtifactRequest:
		return url.Parse(a.URL)
	case *tcqueue.LinkArtifactRequest:
		// defer to the linked artifact
		return queue.GetLatestArtifact_SignedURL(taskId, a.Artifact, duration)
	}
	queue.t.Fatalf("Unknown artifact type %T", artifact)
	return nil, fmt.Errorf("unknown artifact type %T", artifact)
}

func (queue *Queue) ListArtifacts(taskId, runId, continuationToken, limit string) (*tcqueue.ListArtifactsResponse, error) {
	queue.mu.RLock()
	defer queue.mu.RUnlock()
	artifacts := []tcqueue.Artifact{}
	for name, artifact := range queue.artifacts[taskId+":"+runId] {
		var a tcqueue.Artifact
		switch A := artifact.(type) {
		case *tcqueue.ErrorArtifactRequest:
			a = tcqueue.Artifact{
				ContentType: "application/json", // unused
				Expires:     A.Expires,
				Name:        name,
				StorageType: A.StorageType,
			}
		case *tcqueue.RedirectArtifactRequest:
			a = tcqueue.Artifact{
				ContentType: A.ContentType,
				Expires:     A.Expires,
				Name:        name,
				StorageType: A.StorageType,
			}
		case *tcqueue.LinkArtifactRequest:
			a = tcqueue.Artifact{
				ContentType: "text/plain",
				Expires:     A.Expires,
				Name:        name,
				StorageType: A.StorageType,
			}
		case *tcqueue.S3ArtifactRequest:
			a = tcqueue.Artifact{
				ContentType: A.ContentType,
				Expires:     A.Expires,
				Name:        name,
				StorageType: A.StorageType,
			}
		default:
			queue.t.Fatalf("Invalid artifact request type for artifact %#v for task %v runId %v", a, taskId, runId)
		}
		artifacts = append(artifacts, a)
	}
	return &tcqueue.ListArtifactsResponse{
		Artifacts: artifacts,
	}, nil
}

func (queue *Queue) Artifact(taskId, runId, name string) (*tcqueue.GetArtifactContentResponse, error) {
	queue.mu.RLock()
	defer queue.mu.RUnlock()
	taskRunArtifacts, exists := queue.artifacts[taskId+":"+runId]
	if !exists {
		return nil, &tcclient.APICallException{
			CallSummary: &tcclient.CallSummary{
				HTTPResponseBody: fmt.Sprintf("No artifacts for task %v (runId 0) found", taskId),
			},
			RootCause: httpbackoff.BadHttpResponseCode{
				HttpResponseCode: 404,
			},
		}
	}
	artifact, exists := taskRunArtifacts[name]
	if !exists {
		log.Printf("%#v", taskRunArtifacts)
		return nil, &tcclient.APICallException{
			CallSummary: &tcclient.CallSummary{
				HTTPResponseBody: fmt.Sprintf("Task %v (runId 0) found, but does not have artifact %v", taskId, name),
			},
			RootCause: httpbackoff.BadHttpResponseCode{
				HttpResponseCode: 404,
			},
		}
	}
	var jsonResp []byte
	switch a := artifact.(type) {
	case *tcqueue.S3ArtifactRequest:
		url := queue.baseURL + "/s3/" + url.PathEscape(taskId) + "/" + runId + "/" + url.PathEscape(name)
		resp := tcqueue.GetArtifactContentResponse1{
			StorageType: "s3",
			URL:         url,
		}
		var err error
		jsonResp, err = json.Marshal(resp)
		if err != nil {
			return nil, err
		}

	case *tcqueue.ObjectArtifactRequest:
		resp := tcqueue.GetArtifactContentResponse2{
			StorageType: "object",
			Name:        fmt.Sprintf("t/%s/%s/%s", taskId, runId, name),
			Credentials: tcqueue.ObjectServiceCredentials{
				ClientID: "object-fetching-client",
			},
		}
		var err error
		jsonResp, err = json.Marshal(resp)
		if err != nil {
			return nil, err
		}

	case *tcqueue.ErrorArtifactRequest:
		resp := tcqueue.GetArtifactContentResponse4{
			StorageType: "error",
			Message:     a.Message,
			Reason:      a.Reason,
		}
		var err error
		jsonResp, err = json.Marshal(resp)
		if err != nil {
			return nil, err
		}

	case *tcqueue.LinkArtifactRequest:
		return queue.Artifact(taskId, runId, a.Artifact)

	default:
		return nil, fmt.Errorf("unsupported artifact storage type %T", artifact)
	}

	// convert that encoded JSON into an object of the correct type
	var resp tcqueue.GetArtifactContentResponse
	err := (&resp).UnmarshalJSON(jsonResp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (queue *Queue) LatestArtifact(taskId, name string) (*tcqueue.GetArtifactContentResponse, error) {
	// for "latest", default to RunId 0
	return queue.Artifact(taskId, "0", name)
}

func (queue *Queue) ReclaimTask(taskId, runId string) (*tcqueue.TaskReclaimResponse, error) {
	err := queue.ensureRunning(taskId, runId)
	if err != nil {
		return nil, err
	}
	return &tcqueue.TaskReclaimResponse{
		Status: queue.tasks[taskId].Status,
	}, nil
}

func (queue *Queue) ReportCompleted(taskId, runId string) (*tcqueue.TaskStatusResponse, error) {
	err := queue.ensureRunning(taskId, runId)
	if err != nil {
		return nil, err
	}
	queue.mu.Lock()
	queue.tasks[taskId].Status.Runs[0].ReasonResolved = "completed"
	queue.tasks[taskId].Status.Runs[0].State = "completed"
	queue.mu.Unlock()
	return queue.Status(taskId)
}

func (queue *Queue) ReportException(taskId, runId string, payload *tcqueue.TaskExceptionRequest) (*tcqueue.TaskStatusResponse, error) {
	err := queue.ensureRunning(taskId, runId)
	if err != nil {
		return nil, err
	}
	queue.mu.Lock()
	queue.tasks[taskId].Status.Runs[0].ReasonResolved = payload.Reason
	queue.tasks[taskId].Status.Runs[0].State = "exception"
	queue.mu.Unlock()
	return queue.Status(taskId)
}

func (queue *Queue) ReportFailed(taskId, runId string) (*tcqueue.TaskStatusResponse, error) {
	err := queue.ensureRunning(taskId, runId)
	if err != nil {
		return nil, err
	}
	queue.mu.Lock()
	queue.tasks[taskId].Status.Runs[0].ReasonResolved = "failed"
	queue.tasks[taskId].Status.Runs[0].State = "failed"
	queue.mu.Unlock()
	return queue.Status(taskId)
}

func (queue *Queue) Status(taskId string) (*tcqueue.TaskStatusResponse, error) {
	queue.mu.RLock()
	defer queue.mu.RUnlock()
	return &tcqueue.TaskStatusResponse{
		Status: queue.tasks[taskId].Status,
	}, nil
}

func (queue *Queue) Task(taskId string) (*tcqueue.TaskDefinitionResponse, error) {
	queue.mu.RLock()
	defer queue.mu.RUnlock()
	if _, exists := queue.tasks[taskId]; !exists {
		return nil, &tcclient.APICallException{
			CallSummary: &tcclient.CallSummary{
				HTTPResponseBody: fmt.Sprintf("Task definition for task %v not found", taskId),
			},
			RootCause: httpbackoff.BadHttpResponseCode{
				HttpResponseCode: 404,
			},
		}
	}
	return &queue.tasks[taskId].Task, nil
}

func (queue *Queue) DownloadArtifactToFile(taskId string, runId int64, name string, filename string) (string, int64, error) {
	buf, contentType, contentLength, err := queue.DownloadArtifactToBuf(taskId, runId, name)
	if err != nil {
		return "", 0, err
	}
	err = os.WriteFile(filename, buf, 0600)
	if err != nil {
		return "", 0, err
	}
	return contentType, contentLength, err
}

func (queue *Queue) DownloadArtifactToBuf(taskId string, runId int64, name string) (buf []byte, contentType string, contentLength int64, err error) {
	if runId == -1 {
		runId = 0 // "Latest" always means run 0 in this mock implementation
	}
	var artifactJSON *tcqueue.GetArtifactContentResponse
	artifactJSON, err = queue.Artifact(taskId, fmt.Sprintf("%d", runId), name)
	if err != nil {
		return
	}
	var artifact struct {
		StorageType string `json:"storageType"`
	}
	err = json.Unmarshal(*artifactJSON, &artifact)
	if err != nil {
		return
	}

	switch artifact.StorageType {
	case "reference", "s3":
		// `reference` and `s3` both have a URL from which we should download
		// directly, so handle them with the same code
		var urlContent struct {
			URL string `json:"url"`
		}
		err = json.Unmarshal(*artifactJSON, &urlContent)
		if err != nil {
			return
		}

		var resp *http.Response
		resp, err = http.Get(urlContent.URL)
		if err != nil {
			return
		}

		contentType = resp.Header.Get("Content-Type")
		buf, err = io.ReadAll(resp.Body)
		if err != nil {
			return
		}

		contentLength = int64(len(buf))
		return

	case "object":
		// supporting this requires finding the fake object instance created by the
		// service factory, as it contains the artifact data
		panic("fake DownloadArtifactTo..() is not yet supported for object artifacts")

	case "error":
		var errContent struct {
			Message string `json:"message"`
			Reason  string `json:"reason"`
		}
		err = json.Unmarshal(*artifactJSON, &errContent)
		if err != nil {
			return
		}

		err = fmt.Errorf("%s: %s", errContent.Message, errContent.Reason)
		return

	case "link":
		var linkContent struct {
			Artifact string `json:"artifact"`
		}
		err = json.Unmarshal(*artifactJSON, &linkContent)
		if err != nil {
			return
		}
		return queue.DownloadArtifactToBuf(taskId, runId, linkContent.Artifact)

	default:
		err = fmt.Errorf("unsupported artifact storageType '%s'", artifact.StorageType)
		return
	}
}

///////////////////////////////////

// FakeS3Artifact makes a fake artifact with storageType 's3', outside of the
// usual API flow.  It is up to the caller to also create the data on mocks3,
// if necessary
func (queue *Queue) FakeS3Artifact(taskId string, runId string, name string, contentType string) {
	queue.ensureArtifactMap(taskId, runId)
	req := &tcqueue.S3ArtifactRequest{
		ContentType: contentType,
		Expires:     tcclient.Time(time.Now().AddDate(1, 0, 0)),
		StorageType: "s3",
	}
	queue.artifacts[taskId+":"+runId][name] = req
}

// FakeObjectArtifact makes a fake artifact with storageType 'object', outside of the
// usual API flow.  It is up to the caller to also create the data in the object service,
// if necessary
func (queue *Queue) FakeObjectArtifact(taskId string, runId string, name string, contentType string) {
	queue.ensureArtifactMap(taskId, runId)
	req := &tcqueue.ObjectArtifactRequest{
		ContentType: contentType,
		Expires:     tcclient.Time(time.Now().AddDate(1, 0, 0)),
		StorageType: "object",
	}
	queue.artifacts[taskId+":"+runId][name] = req
}

// FakeErrorArtifact makes a fake artifact with storageType 'object', outside of the
// usual API flow.  It is up to the caller to also create the data in the object service,
// if necessary
func (queue *Queue) FakeErrorArtifact(taskId string, runId string, name string, message string, reason string) {
	queue.ensureArtifactMap(taskId, runId)
	req := &tcqueue.ErrorArtifactRequest{
		Message:     message,
		Reason:      reason,
		Expires:     tcclient.Time(time.Now().AddDate(1, 0, 0)),
		StorageType: "error",
	}
	queue.artifacts[taskId+":"+runId][name] = req
}

///////////////////////////////////

func (queue *Queue) ensureRunning(taskId, runId string) error {
	queue.mu.RLock()
	defer queue.mu.RUnlock()
	if queue.tasks[taskId].Status.Runs[0].State != "running" {
		return &tcclient.APICallException{
			CallSummary: &tcclient.CallSummary{
				HTTPResponseBody: fmt.Sprintf("Task %v not running", taskId),
			},
			RootCause: httpbackoff.BadHttpResponseCode{
				HttpResponseCode: 409,
			},
		}
	}
	return nil
}
