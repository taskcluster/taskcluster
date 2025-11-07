package artifacts

import (
	"fmt"

	"github.com/taskcluster/taskcluster/v93/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v93/internal/mocktc/tc"
	"github.com/taskcluster/taskcluster/v93/workers/generic-worker/gwconfig"
)

type ErrorArtifact struct {
	*BaseArtifact
	Path    string
	Message string
	Reason  string
}

func (errArtifact *ErrorArtifact) ProcessResponse(response any, logger Logger, serviceFactory tc.ServiceFactory, config *gwconfig.Config) error {
	log := logger.Errorf
	if errArtifact.Optional {
		log = logger.Infof
	}
	log("Uploading error artifact %v from file %v with message %q, reason %q and expiry %v", errArtifact.Name, errArtifact.Path, errArtifact.Message, errArtifact.Reason, errArtifact.Expires)
	// TODO: process error response
	return nil
}

func (errArtifact *ErrorArtifact) RequestObject() any {
	return &tcqueue.ErrorArtifactRequest{
		Expires:     errArtifact.Expires,
		Message:     errArtifact.Message,
		Reason:      errArtifact.Reason,
		StorageType: "error",
	}
}

func (errArtifact *ErrorArtifact) ResponseObject() any {
	return new(tcqueue.ErrorArtifactResponse)
}

func (errArtifact *ErrorArtifact) String() string {
	return fmt.Sprintf("%v", *errArtifact)
}
