package artifacts

import (
	"fmt"
	"log"

	"github.com/taskcluster/taskcluster/v94/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v94/internal/mocktc/tc"
	"github.com/taskcluster/taskcluster/v94/workers/generic-worker/gwconfig"
)

type RedirectArtifact struct {
	*BaseArtifact
	URL         string
	HideURL     bool
	ContentType string
}

func (redirectArtifact *RedirectArtifact) ProcessResponse(response any, logger Logger, serviceFactory tc.ServiceFactory, config *gwconfig.Config) error {
	output := fmt.Sprintf("Uploading redirect artifact %v to ", redirectArtifact.Name)
	if redirectArtifact.HideURL {
		output += "(URL hidden) "
	} else {
		output += fmt.Sprintf("URL %v ", redirectArtifact.URL)
	}
	output += fmt.Sprintf("with mime type %q and expiry %v", redirectArtifact.ContentType, redirectArtifact.Expires)
	log.Print(output)
	// nothing to do
	return nil
}

func (redirectArtifact *RedirectArtifact) RequestObject() any {
	return &tcqueue.RedirectArtifactRequest{
		ContentType: redirectArtifact.ContentType,
		Expires:     redirectArtifact.Expires,
		StorageType: "reference",
		URL:         redirectArtifact.URL,
	}
}

func (redirectArtifact *RedirectArtifact) ResponseObject() any {
	return new(tcqueue.RedirectArtifactResponse)
}

func (redirectArtifact *RedirectArtifact) String() string {
	return fmt.Sprintf("Redirect Artifact - Name: '%v', URL: '%v', Hide URL: '%v', Expires: %v, MIME Type: '%v'",
		redirectArtifact.Name,
		redirectArtifact.URL,
		redirectArtifact.HideURL,
		redirectArtifact.Expires,
		redirectArtifact.ContentType,
	)
}
