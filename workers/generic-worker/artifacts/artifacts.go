package artifacts

import (
	"io"
	"os"

	tcclient "github.com/taskcluster/taskcluster/v108/clients/client-go"
	"github.com/taskcluster/taskcluster/v108/internal/mocktc/tc"
	"github.com/taskcluster/taskcluster/v108/workers/generic-worker/gwconfig"
)

type (
	// ContentSource streams an artifact's content it opens as the task user.
	ContentSource interface {
		WriteContent(w io.Writer) (int64, error)
	}

	// OpenableContentSource should only be implemented when the worker can open
	// the content itself safely. It is used to upload artifacts without a
	// staging copy which means the file is read as the worker user. This
	// should only ever be used by the insecure engine or for artifacts that
	// the worker creates itself and open through safefs to avoid a task
	// redirecting it.
	OpenableContentSource interface {
		ContentSource
		OpenForUpload() (*os.File, error)
	}

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

		// SourcePath is the path the content was declared from, or "" for
		// artifact types that have no content.
		SourcePath() string

		// PrepareContent reads the content into a temporary file owned by the
		// worker, unless it can be uploaded from where it already is.
		PrepareContent() error

		// DiscardContent closes and removes what PrepareContent opened.
		DiscardContent()
	}

	// Common properties across all implementations.
	BaseArtifact struct {
		Name     string
		Expires  tcclient.Time
		Optional bool
		// SHA256 of the artifact content, computed from the bytes that were
		// actually uploaded. Empty until the upload has succeeded.
		SHA256 string
	}
)

// ContentError distinguishes a failure to read an artifact's content, which
// the task is responsible for from a failure to copy it on the worker,
// which it isn't.
type ContentError struct{ Err error }

func (e ContentError) Error() string {
	return e.Err.Error()
}

func (e ContentError) Unwrap() error {
	return e.Err
}

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

func (*BaseArtifact) SourcePath() string {
	return ""
}

func (*BaseArtifact) PrepareContent() error {
	return nil
}

func (*BaseArtifact) DiscardContent() {}
