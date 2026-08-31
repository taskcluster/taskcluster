package artifacts

import (
	"fmt"
	"log"
	"os"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v107/clients/client-go"
	"github.com/taskcluster/taskcluster/v107/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v107/internal/mocktc/tc"
	"github.com/taskcluster/taskcluster/v107/workers/generic-worker/gwconfig"
)

type ObjectArtifact struct {
	*BaseArtifact
	// Path is the filename of the file declared in the task payload.
	Path string
	// ContentPath is the filename of the file containing the data
	// for this artifact. ContentPath may be equal to Path, or,
	// in the case where a temporary file is created, it may be different.
	// ContentPath will always be read from when uploading the artifact.
	ContentPath string
	// ContentType is used in the Content-Type header.
	ContentType string
	// ContentLength is the original file size in bytes, before any
	// encoding (e.g. gzip). Sent to the queue for monitoring purposes.
	ContentLength int64
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
	if a.ContentPath != a.Path {
		defer os.Remove(a.ContentPath)
	}
	creds := tcclient.Credentials{
		ClientID:    response.Credentials.ClientID,
		AccessToken: response.Credentials.AccessToken,
		Certificate: response.Credentials.Certificate,
	}
	objsvc := serviceFactory.Object(&creds, config.RootURL)

	content, err := openContent(a.ContentPath, a.Path)
	if err != nil {
		return err
	}
	defer content.Close()

	info, err := content.Stat()
	if err != nil {
		return err
	}

	hashes, err := objsvc.UploadFromReadSeekerWithHashes(
		response.ProjectID,
		response.Name,
		a.ContentType,
		info.Size(),
		time.Time(a.Expires),
		response.UploadID,
		content,
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
