package artifacts

import (
	"fmt"
	"io"
	"log"
	"os"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v108/clients/client-go"
	"github.com/taskcluster/taskcluster/v108/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v108/internal/mocktc/tc"
	"github.com/taskcluster/taskcluster/v108/workers/generic-worker/gwconfig"
)

type ObjectArtifact struct {
	*BaseArtifact
	// Path is the filename of the file declared in the task payload.
	Path string
	// Content streams the data for this artifact.
	Content ContentSource
	// ContentType is used in the Content-Type header.
	ContentType string
	// ContentLength is the original file size in bytes, before any
	// encoding (e.g. gzip). Sent to the queue for monitoring purposes.
	ContentLength int64
	body          *os.File
	stagedPath    string
}

func (a *ObjectArtifact) SourcePath() string {
	return a.Path
}

func (a *ObjectArtifact) PrepareContent() (err error) {
	defer func() {
		if err != nil {
			a.DiscardContent()
		}
	}()
	if o, ok := a.Content.(OpenableContentSource); ok {
		a.body, err = o.OpenForUpload()
	} else {
		err = a.stageContent()
	}
	if err != nil {
		return err
	}
	info, err := a.body.Stat()
	if err != nil {
		return err
	}
	a.ContentLength = info.Size()
	return nil
}

func (a *ObjectArtifact) stageContent() error {
	body, err := os.CreateTemp("", "artifact-")
	if err != nil {
		return err
	}
	a.body = body
	a.stagedPath = body.Name()
	_, err = a.Content.WriteContent(body)
	return err
}

func (a *ObjectArtifact) DiscardContent() {
	if a.body != nil {
		a.body.Close()
		a.body = nil
	}
	if a.stagedPath != "" {
		os.Remove(a.stagedPath)
		a.stagedPath = ""
	}
}

func (a *ObjectArtifact) RequestObject() any {
	return &tcqueue.ObjectArtifactRequest{
		ContentType:   a.ContentType,
		ContentLength: a.ContentLength,
		Expires:       a.Expires,
		StorageType:   "object",
	}
}

func (a *ObjectArtifact) ResponseObject() any {
	return new(tcqueue.ObjectArtifactResponse)
}

func (a *ObjectArtifact) ProcessResponse(resp any, logger Logger, serviceFactory tc.ServiceFactory, config *gwconfig.Config) (err error) {
	response := resp.(*tcqueue.ObjectArtifactResponse)
	log.Printf("Uploading artifact %v from file %v with content type %q and expiry %v", a.Name, a.Path, a.ContentType, a.Expires)
	creds := tcclient.Credentials{
		ClientID:    response.Credentials.ClientID,
		AccessToken: response.Credentials.AccessToken,
		Certificate: response.Credentials.Certificate,
	}
	objsvc := serviceFactory.Object(&creds, config.RootURL)

	if _, err = a.body.Seek(0, io.SeekStart); err != nil {
		return err
	}

	hashes, err := objsvc.UploadFromReadSeekerWithHashes(
		response.ProjectID,
		response.Name,
		a.ContentType,
		a.ContentLength,
		time.Time(a.Expires),
		response.UploadID,
		a.body,
	)
	if err != nil {
		return err
	}
	a.SHA256 = hashes["sha256"]
	return nil
}

func (a *ObjectArtifact) FinishArtifact(resp any, queue tc.Queue, taskID, runID, name string) error {
	response := resp.(*tcqueue.ObjectArtifactResponse)
	far := tcqueue.FinishArtifactRequest{
		UploadID: response.UploadID,
	}
	return queue.FinishArtifact(taskID, runID, name, &far)
}

func (a *ObjectArtifact) String() string {
	return fmt.Sprintf("Object Artifact - Name: '%v', Path: '%v', Expires: %v, Content-Type: '%v', Content-Length: '%v'",
		a.Name,
		a.Path,
		a.Expires,
		a.ContentType,
		a.ContentLength,
	)
}
