package artifacts

import (
	"github.com/taskcluster/taskcluster/v54/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v54/internal/mocktc/tc"
	"github.com/taskcluster/taskcluster/v54/workers/generic-worker/gwconfig"
)

type LinkArtifact struct {
	*BaseArtifact
	Artifact    string
	ContentType string
}

func (linkArtifact *LinkArtifact) ProcessResponse(response interface{}, logger Logger, serviceFactory tc.ServiceFactory, config *gwconfig.Config) error {
	logger.Infof("Uploading link artifact %v to artifact %v with expiry %v", linkArtifact.Name, linkArtifact.Artifact, linkArtifact.Expires)
	// nothing to do
	return nil
}

func (linkArtifact *LinkArtifact) RequestObject() interface{} {
	return &tcqueue.LinkArtifactRequest{
		Expires:     linkArtifact.Expires,
		StorageType: "link",
		ContentType: linkArtifact.ContentType,
		Artifact:    linkArtifact.Artifact,
	}
}

func (linkArtifact *LinkArtifact) ResponseObject() interface{} {
	return new(tcqueue.LinkArtifactResponse)
}
