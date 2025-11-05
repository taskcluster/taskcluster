package artifacts

import (
	"fmt"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v92/clients/client-go"
	"github.com/taskcluster/taskcluster/v92/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v92/internal/mocktc/tc"
	"github.com/taskcluster/taskcluster/v92/workers/generic-worker/gwconfig"
)

type ObjectArtifact struct {
	*BaseArtifact
	// Path is the filename of the file containing the data
	// for this artifact.
	Path string
	// ContentType is used in the Content-Type header.
	ContentType string
}

func (a *ObjectArtifact) RequestObject() any {
	return &tcqueue.ObjectArtifactRequest{
		ContentType: a.ContentType,
		Expires:     a.Expires,
		StorageType: "object",
	}
}

func (a *ObjectArtifact) ResponseObject() any {
	return new(tcqueue.ObjectArtifactResponse)
}

func (a *ObjectArtifact) ProcessResponse(resp any, logger Logger, serviceFactory tc.ServiceFactory, config *gwconfig.Config) (err error) {
	response := resp.(*tcqueue.ObjectArtifactResponse)
	logger.Infof("Uploading artifact %v from file %v with content type %q and expiry %v", a.Name, a.Path, a.ContentType, a.Expires)
	creds := tcclient.Credentials{
		ClientID:    response.Credentials.ClientID,
		AccessToken: response.Credentials.AccessToken,
		Certificate: response.Credentials.Certificate,
	}
	objsvc := serviceFactory.Object(&creds, config.RootURL)
	return objsvc.UploadFromFile(
		response.ProjectID,
		response.Name,
		a.ContentType,
		time.Time(a.Expires),
		response.UploadID,
		a.Path,
	)
}

func (a *ObjectArtifact) FinishArtifact(resp any, queue tc.Queue, taskID, runID, name string) error {
	response := resp.(*tcqueue.ObjectArtifactResponse)
	far := tcqueue.FinishArtifactRequest{
		UploadID: response.UploadID,
	}
	return queue.FinishArtifact(taskID, runID, name, &far)
}

func (a *ObjectArtifact) String() string {
	return fmt.Sprintf("Object Artifact - Name: '%v', Path: '%v', Expires: %v, Content-Type: '%v'",
		a.Name,
		a.Path,
		a.Expires,
		a.ContentType,
	)
}
