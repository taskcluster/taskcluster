package tcqueue

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/orcaman/writerseeker"
	tcclient "github.com/taskcluster/taskcluster/v93/clients/client-go"
	"github.com/taskcluster/taskcluster/v93/clients/client-go/internal"
	"github.com/taskcluster/taskcluster/v93/clients/client-go/tcobject"
)

type HTTPRetryError = internal.HTTPRetryError

// DownloadArtifactToBuf is a convenience method to download an artifact to an
// in-memory byte slice. If RunID is -1, the latest run is used.  Returns the
// object itself, the Content-Type and Content-Length of the downloaded object.
func (queue *Queue) DownloadArtifactToBuf(taskID string, runID int64, name string) (buf []byte, contentType string, contentLength int64, err error) {
	writeSeeker := &writerseeker.WriterSeeker{}
	contentType, contentLength, err = queue.DownloadArtifactToWriteSeeker(taskID, runID, name, writeSeeker)
	if err != nil {
		return
	}
	reader := writeSeeker.BytesReader()
	buf = make([]byte, reader.Len())
	_, err = reader.Read(buf)
	return
}

// DownloadArtifactToFile is a convenience method to download an object to a
// file. If RunID is -1, the latest run is used.  The file is overwritten if it
// already exists. Returns the Content-Type and Content-Length of the
// downloaded object.
func (queue *Queue) DownloadArtifactToFile(taskID string, runID int64, name string, filepath string) (contentType string, contentLength int64, err error) {
	writeSeeker, err := os.Create(filepath)
	if err != nil {
		return "", 0, err
	}
	defer func() {
		err2 := writeSeeker.Close()
		if err == nil {
			err = err2
		}
	}()
	return queue.DownloadArtifactToWriteSeeker(taskID, runID, name, writeSeeker)
}

// DownloadArtifactToWriteSeeker downloads the named object from the object
// service and writes it to writeSeeker, retrying if intermittent errors occur.
// If RunID is -1, the latest run is used.  Returns the Content-Type and
// Content-Length of the downloaded object.
func (queue *Queue) DownloadArtifactToWriteSeeker(taskID string, runID int64, name string, writeSeeker io.WriteSeeker) (contentType string, contentLength int64, err error) {
	// get the artifact content information
	var artifactJSON *GetArtifactContentResponse
	if runID == -1 {
		artifactJSON, err = queue.LatestArtifact(taskID, name)
	} else {
		artifactJSON, err = queue.Artifact(taskID, fmt.Sprintf("%d", runID), name)
	}
	if err != nil {
		return
	}

	var artifact struct {
		StorageType string `json:"storageType"`
	}
	err = json.Unmarshal(*artifactJSON, &artifact)
	if err != nil {
		return
	}

	switch artifact.StorageType {
	case "reference", "s3":
		// `reference` and `s3` both have a URL from which we should download
		// directly, so handle them with the same code
		var urlContent struct {
			URL string `json:"url"`
		}
		err = json.Unmarshal(*artifactJSON, &urlContent)
		if err != nil {
			return
		}

		return internal.GetURL(queue.HTTPBackoffClient, urlContent.URL, writeSeeker)

	case "object":
		var objectContent struct {
			Name        string               `json:"name"`
			Credentials tcclient.Credentials `json:"credentials"`
		}
		err = json.Unmarshal(*artifactJSON, &objectContent)
		if err != nil {
			return
		}

		object := tcobject.New(&objectContent.Credentials, queue.RootURL)
		object.HTTPBackoffClient = queue.HTTPBackoffClient

		return object.DownloadToWriteSeeker(objectContent.Name, writeSeeker)

	case "error":
		var errContent struct {
			Message string `json:"message"`
			Reason  string `json:"reason"`
		}
		err = json.Unmarshal(*artifactJSON, &errContent)
		if err != nil {
			return
		}

		return "", 0, fmt.Errorf("%s: %s", errContent.Message, errContent.Reason)

	default:
		err = fmt.Errorf("unsupported artifact storageType '%s'", artifact.StorageType)
		return
	}
}
