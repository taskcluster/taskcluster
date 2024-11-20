package artifacts

import (
	"fmt"

	"github.com/taskcluster/taskcluster/v75/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v75/internal/mocktc/tc"
	"github.com/taskcluster/taskcluster/v75/workers/generic-worker/gwconfig"
)

type RedirectArtifact struct {
	*BaseArtifact
	URL         string
	HideURL     bool
	ContentType string
}

func (redirectArtifact *RedirectArtifact) ProcessResponse(response interface{}, logger Logger, serviceFactory tc.ServiceFactory, config *gwconfig.Config) error {
	log := fmt.Sprintf("Uploading redirect artifact %v to ", redirectArtifact.Name)
	if redirectArtifact.HideURL {
		log += "(URL hidden) "
	} else {
		log += fmt.Sprintf("URL %v ", redirectArtifact.URL)
	}
	log += fmt.Sprintf("with mime type %q and expiry %v", redirectArtifact.ContentType, redirectArtifact.Expires)
	logger.Infof(log)
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
