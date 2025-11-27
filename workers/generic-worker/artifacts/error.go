package artifacts

import (
	"fmt"
	"log"

	"github.com/taskcluster/taskcluster/v94/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v94/internal/mocktc/tc"
	"github.com/taskcluster/taskcluster/v94/workers/generic-worker/gwconfig"
)

type ErrorArtifact struct {
	*BaseArtifact
	Path    string
	Message string
	Reason  string
}

func (errArtifact *ErrorArtifact) ProcessResponse(response any, logger Logger, serviceFactory tc.ServiceFactory, config *gwconfig.Config) error {
	printLog := logger.Errorf
	if errArtifact.Optional {
		printLog = log.Printf
	}
	printLog("Uploading error artifact %v from file %v with message %q, reason %q and expiry %v", errArtifact.Name, errArtifact.Path, errArtifact.Message, errArtifact.Reason, errArtifact.Expires)
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
