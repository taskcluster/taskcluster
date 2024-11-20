package artifacts

import (
	"compress/gzip"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"os"
	"path/filepath"
	"runtime"

	"github.com/gofrs/flock"
	"github.com/taskcluster/httpbackoff/v3"
	"github.com/taskcluster/taskcluster/v75/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v75/internal/mocktc/tc"
	"github.com/taskcluster/taskcluster/v75/workers/generic-worker/gwconfig"
)

type S3Artifact struct {
	*BaseArtifact
	// Path is the filename of the file declared in the task payload.
	Path string
	// ContentPath is the filename of the file containing the data
	// for this artifact. ContentPath may be equal to Path, or,
	// in the case where a temporary file is created, it may be different.
	// ContentPath will always be read from when uploading the artifact.
	ContentPath     string
	ContentEncoding string
	ContentType     string
}

// createTempFileForPUTBody first tries to put a file lock on
// the artifact to prevent further writes to it (posix only).
// The file path of the locked file is returned. If this is unsuccessful,
// it will fall back to copying to a temporary file.
// This method will also gzip-compress the file at Path and writes
// it to a temporary file in the same directory. The file path of the
// generated temporary file is returned.
// A callback function is also returned that should be used to
// cleanup the resources (e.g. unlock the file lock or delete the
// temp file). It is the responsibility of the caller to
// use this cleanup function.
func (s3Artifact *S3Artifact) createTempFileForPUTBody() (string, func()) {
	var fileLock *flock.Flock
	if runtime.GOOS != "windows" {
		fileLock = flock.New(s3Artifact.ContentPath)
		locked, _ := fileLock.TryLock()
		if locked && s3Artifact.ContentEncoding != "gzip" {
			return s3Artifact.ContentPath, func() {
				_ = fileLock.Unlock()
			}
		}
	}

	baseName := filepath.Base(s3Artifact.Path)
	tmpFile, err := os.CreateTemp("", baseName)
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
	source, err := os.Open(s3Artifact.ContentPath)
	if err != nil {
		panic(err)
	}
	defer source.Close()
	_, _ = io.Copy(target, source)
	return tmpFile.Name(), func() {
		if runtime.GOOS != "windows" {
			_ = fileLock.Unlock()
		}
		os.Remove(tmpFile.Name())
	}
}

func (s3Artifact *S3Artifact) ProcessResponse(resp interface{}, logger Logger, serviceFactory tc.ServiceFactory, config *gwconfig.Config) (err error) {
	response := resp.(*tcqueue.S3ArtifactResponse)

	logger.Infof("Uploading artifact %v from file %v with content encoding %q, mime type %q and expiry %v", s3Artifact.Name, s3Artifact.Path, s3Artifact.ContentEncoding, s3Artifact.ContentType, s3Artifact.Expires)

	transferContentFile, cleanup := s3Artifact.createTempFileForPUTBody()
	defer cleanup()

	defer func() {
		if s3Artifact.Path != s3Artifact.ContentPath {
			// If we created a temporary file, delete it.
			os.Remove(s3Artifact.ContentPath)
		}
	}()

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
		if putResp.StatusCode == http.StatusBadRequest {
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
	return fmt.Sprintf("S3 Artifact - Name: '%v', Path: '%v', Expires: %v, Content Encoding: '%v', MIME Type: '%v'",
		s3Artifact.Name,
		s3Artifact.Path,
		s3Artifact.Expires,
		s3Artifact.ContentEncoding,
		s3Artifact.ContentType,
	)
}
