// The interfaces in this package contain the methods of each taskcluster
// service, allowing the use of fakes that provide the same methods.
package tc

import (
	"net/url"
	"time"

	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcauth"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcindex"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcobject"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcpurgecache"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcsecrets"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcworkermanager"
)

type Auth interface {
	ExpandScopes(payload *tcauth.SetOfScopes) (*tcauth.SetOfScopes, error)
	SentryDSN(project string) (*tcauth.SentryDSNResponse, error)
	WebsocktunnelToken(wstAudience, wstClient string) (*tcauth.WebsocktunnelTokenResponse, error)
}

type Index interface {
	FindTask(indexPath string) (*tcindex.IndexedTaskResponse, error)
}

type WorkerManager interface {
	RegisterWorker(payload *tcworkermanager.RegisterWorkerRequest) (*tcworkermanager.RegisterWorkerResponse, error)
	WorkerPool(workerPoolId string) (*tcworkermanager.WorkerPoolFullDefinition, error)
	CreateWorkerPool(workerPoolId string, payload *tcworkermanager.WorkerPoolDefinition) (*tcworkermanager.WorkerPoolFullDefinition, error)
	ShouldWorkerTerminate(workerPoolId, workerGroup, workerId string) (*tcworkermanager.ShouldWorkerTerminateResponse, error)
}

type PurgeCache interface {
	PurgeRequests(workerPoolId, since string) (*tcpurgecache.OpenPurgeRequestList, error)
}

type Secrets interface {
	Ping() error
	Set(name string, payload *tcsecrets.Secret) error
	Remove(name string) error
	Get(name string) (*tcsecrets.Secret, error)
	List(continuationToken, limit string) (*tcsecrets.SecretsList, error)
}

type Queue interface {
	CancelTask(taskId string) (*tcqueue.TaskStatusResponse, error)
	ClaimWork(taskQueueId string, payload *tcqueue.ClaimWorkRequest) (*tcqueue.ClaimWorkResponse, error)
	CreateArtifact(taskId, runId, name string, payload *tcqueue.PostArtifactRequest) (*tcqueue.PostArtifactResponse, error)
	CreateTask(taskId string, payload *tcqueue.TaskDefinitionRequest) (*tcqueue.TaskStatusResponse, error)
	FinishArtifact(taskId, runId, name string, payload *tcqueue.FinishArtifactRequest) error
	GetLatestArtifact_SignedURL(taskId, name string, duration time.Duration) (*url.URL, error)
	ListArtifacts(taskId, runId, continuationToken, limit string) (*tcqueue.ListArtifactsResponse, error)
	Artifact(taskId, runId, name string) (*tcqueue.GetArtifactContentResponse, error)
	LatestArtifact(taskId, name string) (*tcqueue.GetArtifactContentResponse, error)
	ReclaimTask(taskId, runId string) (*tcqueue.TaskReclaimResponse, error)
	ReportCompleted(taskId, runId string) (*tcqueue.TaskStatusResponse, error)
	ReportException(taskId, runId string, payload *tcqueue.TaskExceptionRequest) (*tcqueue.TaskStatusResponse, error)
	ReportFailed(taskId, runId string) (*tcqueue.TaskStatusResponse, error)
	Status(taskId string) (*tcqueue.TaskStatusResponse, error)
	Task(taskId string) (*tcqueue.TaskDefinitionResponse, error)
	DownloadArtifactToFile(taskId string, runId int64, name string, filename string) (string, int64, error)
	DownloadArtifactToBuf(taskId string, runId int64, name string) ([]byte, string, int64, error)
}

type Object interface {
	CreateUpload(name string, payload *tcobject.CreateUploadRequest) (*tcobject.CreateUploadResponse, error)
	FinishUpload(name string, payload *tcobject.FinishUploadRequest) error
	StartDownload(name string, payload *tcobject.DownloadObjectRequest) (*tcobject.DownloadObjectResponse, error)

	// non-API functions
	UploadFromFile(projectID string, name string, contentType string, expires time.Time, uploadID string, filepath string) error
}
