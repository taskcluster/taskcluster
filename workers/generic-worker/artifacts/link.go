package artifacts

import (
	"github.com/taskcluster/taskcluster/v83/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v83/internal/mocktc/tc"
	"github.com/taskcluster/taskcluster/v83/workers/generic-worker/gwconfig"
)

type LinkArtifact struct {
	*BaseArtifact
	Artifact    string
	ContentType string
}

func (linkArtifact *LinkArtifact) ProcessResponse(response any, logger Logger, serviceFactory tc.ServiceFactory, config *gwconfig.Config) error {
	logger.Infof("Uploading link artifact %v to artifact %v with expiry %v", linkArtifact.Name, linkArtifact.Artifact, linkArtifact.Expires)
	// nothing to do
	return nil
}

func (linkArtifact *LinkArtifact) RequestObject() any {
	return &tcqueue.LinkArtifactRequest{
		Expires:     linkArtifact.Expires,
		StorageType: "link",
		ContentType: linkArtifact.ContentType,
		Artifact:    linkArtifact.Artifact,
	}
}

func (linkArtifact *LinkArtifact) ResponseObject() any {
	return new(tcqueue.LinkArtifactResponse)
}
