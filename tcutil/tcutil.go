package tcutil

import (
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"

	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/tcqueue"
	artifact "github.com/taskcluster/taskcluster-lib-artifact-go"
)

type ArtifactSource struct {
	Name      string
	Content   io.ReadSeeker
	GZip      bool
	Multipart bool
}

// PublishTask submits the task `taskID` with definition `tdr` using `queue`. The
// task is claimed using `workerGroup` and `workerID`, and then `artifacts` are
// uploaded in sequence using taskcluster-lib-artifact-go.  This function is useful for
// e.g.  integration tests for the various taskcluster go libraries and
// utilities that rely on tasks and/or artifact content to test their features.
func PublishTask(queue *tcqueue.Queue, taskID string, tdr tcqueue.TaskDefinitionRequest, workerGroup, workerID string, artifacts []ArtifactSource) error {
	workerType := tdr.WorkerType
	provisionerID := tdr.ProvisionerID
	cwrq := tcqueue.ClaimWorkRequest{
		Tasks:       1,
		WorkerGroup: workerGroup,
		WorkerID:    workerID,
	}
	log.Printf("Creating task %v", taskID)
	_, err := queue.CreateTask(taskID, &tdr)
	if err != nil {
		return fmt.Errorf("Exception thrown creating task %v:\n%s", taskID, err)
	}
	log.Printf("Claiming work for provisionerId/workerType %v/%v", provisionerID, workerType)
	cwrs, err := queue.ClaimWork(provisionerID, workerType, &cwrq)
	if err != nil {
		return fmt.Errorf("Exception thrown claiming task %v:\n%s", taskID, err)
	}
	taskCreds := cwrs.Tasks[0].Credentials
	taskQueue := tcqueue.New(&tcclient.Credentials{
		ClientID:         taskCreds.ClientID,
		AccessToken:      taskCreds.AccessToken,
		Certificate:      taskCreds.Certificate,
		AuthorizedScopes: nil,
	}, "")
	taskQueue.BaseURL = queue.BaseURL
	for _, as := range artifacts {
		err = as.Upload(taskQueue, taskID)
		if err != nil {
			return fmt.Errorf("Exception uploading artifact %v for task %v: %v", as.Name, taskID, err)
		}
	}

	log.Printf("Resolving task %v", taskID)
	_, err = taskQueue.ReportCompleted(taskID, "0")
	if err != nil {
		return fmt.Errorf("Exception reporting task %v completed: %v", taskID, err)
	}
	return nil
}

func (as *ArtifactSource) Upload(queue *tcqueue.Queue, taskID string) (err error) {

	// To upload an artifact, we need to supply a ReadWriteSeeker that can be
	// used for storing the encoded content; we'll create a temp file for this.
	var out *os.File
	out, err = ioutil.TempFile("", filepath.Base(as.Name))
	if err != nil {
		return fmt.Errorf("Could not create temporary file for artifact %v - is your filesystem full? %v", as.Name, err)
	}

	// delete temp file when done
	defer func() {
		deleteError := os.Remove(out.Name())
		if err == nil {
			err = deleteError
		}
	}()

	// The responsibility of closing the temp file rests with us.
	// See https://godoc.org/github.com/taskcluster/taskcluster-lib-artifact-go#hdr-Input_and_Output
	defer func() {
		closeError := out.Close()
		if err == nil {
			err = closeError
		}
	}()

	log.Printf("Uploading artifact %v for task %v", as.Name, taskID)
	a := artifact.New(queue)
	err = a.Upload(taskID, "0", as.Name, as.Content, out, as.GZip, as.Multipart)
	if err != nil {
		return fmt.Errorf("Exception thrown uploading artifact %v in task %v:\n%s", as.Name, taskID, err)
	}
	return
}
