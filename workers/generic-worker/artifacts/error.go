package artifacts

import (
	"fmt"

	"github.com/taskcluster/taskcluster/v54/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v54/internal/mocktc/tc"
	"github.com/taskcluster/taskcluster/v54/workers/generic-worker/gwconfig"
)

type ErrorArtifact struct {
	*BaseArtifact
	Path    string
	Message string
	Reason  string
}

func (errArtifact *ErrorArtifact) ProcessResponse(response interface{}, logger Logger, serviceFactory tc.ServiceFactory, config *gwconfig.Config) error {
	logger.Errorf("Uploading error artifact %v from file %v with message %q, reason %q and expiry %v", errArtifact.Name, errArtifact.Path, errArtifact.Message, errArtifact.Reason, errArtifact.Expires)
	// TODO: process error response
	return nil
}

func (errArtifact *ErrorArtifact) RequestObject() interface{} {
	return &tcqueue.ErrorArtifactRequest{
		Expires:     errArtifact.Expires,
		Message:     errArtifact.Message,
		Reason:      errArtifact.Reason,
		StorageType: "error",
	}
}

func (errArtifact *ErrorArtifact) ResponseObject() interface{} {
	return new(tcqueue.ErrorArtifactResponse)
}

func (errArtifact *ErrorArtifact) String() string {
	return fmt.Sprintf("%v", *errArtifact)
}
