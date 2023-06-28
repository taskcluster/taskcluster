package artifacts

import (
	"github.com/taskcluster/taskcluster/v54/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v54/internal/mocktc/tc"
	"github.com/taskcluster/taskcluster/v54/workers/generic-worker/gwconfig"
)

type RedirectArtifact struct {
	*BaseArtifact
	URL         string
	ContentType string
}

func (redirectArtifact *RedirectArtifact) ProcessResponse(response interface{}, logger Logger, serviceFactory tc.ServiceFactory, config *gwconfig.Config) error {
	logger.Infof("Uploading redirect artifact %v to URL %v with mime type %q and expiry %v", redirectArtifact.Name, redirectArtifact.URL, redirectArtifact.ContentType, redirectArtifact.Expires)
	// nothing to do
	return nil
}

func (redirectArtifact *RedirectArtifact) RequestObject() interface{} {
	return &tcqueue.RedirectArtifactRequest{
		ContentType: redirectArtifact.ContentType,
		Expires:     redirectArtifact.Expires,
		StorageType: "reference",
		URL:         redirectArtifact.URL,
	}
}

func (redirectArtifact *RedirectArtifact) ResponseObject() interface{} {
	return new(tcqueue.RedirectArtifactResponse)
}
