package artifacts

import (
	tcclient "github.com/taskcluster/taskcluster/v96/clients/client-go"
	"github.com/taskcluster/taskcluster/v96/internal/mocktc/tc"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/gwconfig"
)

type (
	// TaskArtifact is the interface that all artifact types implement
	// (S3Artifact, RedirectArtifact, ErrorArtifact), for publishing artifacts
	// according to the tcqueue.CreateArtifact docs.
	TaskArtifact interface {

		// RequestObject returns a pointer to a go type containing the data for
		// marshaling into tcqueue.PostArtifactRequest for passing to
		// tcqueue.CreateArtifact.
		//
		// For example, this is a *tcqueue.S3ArtifactRequest for type
		// S3Artifact.
		RequestObject() any

		// ResponseObject returns a pointer to an empty go type for
		// unmarshaling the result of a tcqueue.CreateArtifact API call into.
		//
		// For example, this would be new(tcqueue.RedirectArtifactRequest) for
		// RedirectArtifact.
		ResponseObject() any

		// ProcessResponse is a callback for performing actions after
		// tcqueue.CreateArtifact API is called. response is the object
		// returned by ResponseObject(), but populated with the result of
		// tcqueue.CreateArtifact.
		//
		// For example, ProcessResponse for S3Artifact uploads the artifact to
		// S3, since the tcqueue.CreateArtifact API call only informs the Queue
		// that the artifact exists without uploading it.
		//
		// ProcessResponse can be an empty method if no post
		// tcqueue.CreateArtifact steps are required.
		ProcessResponse(response any, logger Logger, serviceFactory tc.ServiceFactory, config *gwconfig.Config) error

		// FinishArtifact calls queue.FinishArtifact if necessary for the artifact type
		FinishArtifact(response any, queue tc.Queue, taskID, runID, name string) error

		// String returns a string representation of the artifact type
		// with all properties.
		//
		// For example, String for S3Artifact would look something like:
		// "S3 Artifact - Name: artifact, Path: /test/path, Expires: 2006-01-02T15:04:05.000Z,
		// Content Encoding: 'gzip', MIME Type: 'text/plain; charset=utf-8'"
		String() string

		// Base returns a *BaseArtifact which stores the properties common to
		// all implementations
		Base() *BaseArtifact
	}

	// Common properties across all implementations.
	BaseArtifact struct {
		Name     string
		Expires  tcclient.Time
		Optional bool
	}
)

func (base *BaseArtifact) Base() *BaseArtifact {
	return base
}

// FinishArtifact implements TaskArtifact#FinishArtifact.
//
// This provides a default implementation that does not call
// queue.FinishArtifact, as appropriate for link, redirect, error, and s3
// artifact types.
func (*BaseArtifact) FinishArtifact(response any, queue tc.Queue, taskID, runID, name string) error {
	return nil
}
