package artifacts

import (
	"compress/gzip"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"net/http/httputil"
	"os"
	"path/filepath"

	"github.com/taskcluster/httpbackoff/v3"
	tcclient "github.com/taskcluster/taskcluster/v44/clients/client-go"
	"github.com/taskcluster/taskcluster/v44/clients/client-go/tcqueue"
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
		RequestObject() interface{}

		// ResponseObject returns a pointer to an empty go type for
		// unmarshaling the result of a tcqueue.CreateArtifact API call into.
		//
		// For example, this would be new(tcqueue.RedirectArtifactRequest) for
		// RedirectArtifact.
		ResponseObject() interface{}

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
		ProcessResponse(response interface{}, logger Logger) error

		// Base returns a *BaseArtifact which stores the properties common to
		// all implementations
		Base() *BaseArtifact
	}

	// Common properties across all implementations.
	BaseArtifact struct {
		Name    string
		Expires tcclient.Time
	}

	S3Artifact struct {
		*BaseArtifact
		// Path is the task-directory-relative path to the file (as given in
		// the task description, for example)
		Path string
		// RawContentFile is the filename of the file containing the data
		// for this artifact.
		RawContentFile  string
		ContentEncoding string
		ContentType     string
	}

	RedirectArtifact struct {
		*BaseArtifact
		URL         string
		ContentType string
	}

	LinkArtifact struct {
		*BaseArtifact
		Artifact    string
		ContentType string
	}

	ErrorArtifact struct {
		*BaseArtifact
		Path    string
		Message string
		Reason  string
	}
)

func (base *BaseArtifact) Base() *BaseArtifact {
	return base
}

func (redirectArtifact *RedirectArtifact) ProcessResponse(response interface{}, logger Logger) error {
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

func (linkArtifact *LinkArtifact) ProcessResponse(response interface{}, logger Logger) error {
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

func (errArtifact *ErrorArtifact) ProcessResponse(response interface{}, logger Logger) error {
	logger.Errorf("Uploading error artifact %v from file %v with message %q, reason %q and expiry %v", errArtifact.Name, errArtifact.Path, errArtifact.Message, errArtifact.Reason, errArtifact.Expires)
	// TODO: process error response
	return nil
}

func (errArtifact *ErrorArtifact) RequestObject() interface{} {
	return &tcqueue.ErrorArtifactRequest{
		Expires:     errArtifact.Expires,
		Message:     errArtifact.Message,
		Reason:      errArtifact.Reason,
		StorageType: "error",
	}
}

func (errArtifact *ErrorArtifact) ResponseObject() interface{} {
	return new(tcqueue.ErrorArtifactResponse)
}

func (errArtifact *ErrorArtifact) String() string {
	return fmt.Sprintf("%v", *errArtifact)
}

// createTempFileForPUTBody gzip-compresses the file at RawContentFile and
// writes it to a temporary file in the same directory. The file path of the
// generated temporary file is returned.  It is the responsibility of the
// caller to delete the temporary file.
func (s3Artifact *S3Artifact) CreateTempFileForPUTBody() string {
	baseName := filepath.Base(s3Artifact.RawContentFile)
	tmpFile, err := ioutil.TempFile("", baseName)
	if err != nil {
		panic(err)
	}
	defer tmpFile.Close()
	var target io.Writer = tmpFile
	if s3Artifact.ContentEncoding == "gzip" {
		gzipLogWriter := gzip.NewWriter(tmpFile)
		defer gzipLogWriter.Close()
		gzipLogWriter.Name = baseName
		target = gzipLogWriter
	}
	source, err := os.Open(s3Artifact.RawContentFile)
	if err != nil {
		panic(err)
	}
	defer source.Close()
	_, _ = io.Copy(target, source)
	return tmpFile.Name()
}

func (s3Artifact *S3Artifact) ProcessResponse(resp interface{}, logger Logger) (err error) {
	response := resp.(*tcqueue.S3ArtifactResponse)

	logger.Infof("Uploading artifact %v from file %v with content encoding %q, mime type %q and expiry %v", s3Artifact.Name, s3Artifact.Path, s3Artifact.ContentEncoding, s3Artifact.ContentType, s3Artifact.Expires)

	transferContentFile := s3Artifact.CreateTempFileForPUTBody()
	defer os.Remove(transferContentFile)

	// perform http PUT to upload to S3...
	httpClient := &http.Client{}
	httpCall := func() (putResp *http.Response, tempError error, permError error) {
		var transferContent *os.File
		transferContent, permError = os.Open(transferContentFile)
		if permError != nil {
			return
		}
		defer transferContent.Close()
		var transferContentFileInfo os.FileInfo
		transferContentFileInfo, permError = transferContent.Stat()
		if permError != nil {
			return
		}
		transferContentLength := transferContentFileInfo.Size()

		var httpRequest *http.Request
		httpRequest, permError = http.NewRequest("PUT", response.PutURL, transferContent)
		if permError != nil {
			return
		}
		httpRequest.Header.Set("Content-Type", response.ContentType)
		httpRequest.ContentLength = transferContentLength
		if enc := s3Artifact.ContentEncoding; enc != "" {
			httpRequest.Header.Set("Content-Encoding", enc)
		}
		requestHeaders, dumpError := httputil.DumpRequestOut(httpRequest, false)
		if dumpError != nil {
			log.Print("Could not dump request, never mind...")
		} else {
			log.Print("Request")
			log.Print(string(requestHeaders))
		}
		putResp, tempError = httpClient.Do(httpRequest)
		if tempError != nil {
			return
		}
		// bug 1394557: s3 incorrectly returns HTTP 400 for connection inactivity,
		// which can/should be retried, so explicitly handle...
		if putResp.StatusCode == 400 {
			tempError = fmt.Errorf("S3 returned status code 400 which could be an intermittent issue - see https://bugzilla.mozilla.org/show_bug.cgi?id=1394557")
		}
		return
	}
	putResp, putAttempts, err := httpbackoff.Retry(httpCall)
	log.Printf("%v put requests issued to %v", putAttempts, response.PutURL)
	if putResp != nil {
		defer putResp.Body.Close()
		respBody, dumpError := httputil.DumpResponse(putResp, true)
		if dumpError != nil {
			log.Print("Could not dump response output, never mind...")
		} else {
			log.Print("Response")
			log.Print(string(respBody))
		}
	}
	return err
}

func (s3Artifact *S3Artifact) RequestObject() interface{} {
	return &tcqueue.S3ArtifactRequest{
		ContentType: s3Artifact.ContentType,
		Expires:     s3Artifact.Expires,
		StorageType: "s3",
	}
}

func (s3Artifact *S3Artifact) ResponseObject() interface{} {
	return new(tcqueue.S3ArtifactResponse)
}

func (s3Artifact *S3Artifact) String() string {
	return fmt.Sprintf("S3 Artifact - Name: '%v', Path: '%v', RawContentFile: '%v', Expires: %v, Content Encoding: '%v', MIME Type: '%v'",
		s3Artifact.Name,
		s3Artifact.Path,
		s3Artifact.RawContentFile,
		s3Artifact.Expires,
		s3Artifact.ContentEncoding,
		s3Artifact.ContentType,
	)
}
