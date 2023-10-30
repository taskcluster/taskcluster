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

	"github.com/taskcluster/httpbackoff/v3"
	"github.com/taskcluster/taskcluster/v57/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v57/internal/mocktc/tc"
	"github.com/taskcluster/taskcluster/v57/workers/generic-worker/gwconfig"
	"github.com/taskcluster/taskcluster/v57/workers/generic-worker/process"
)

type S3Artifact struct {
	*BaseArtifact
	// Path is the filename of the original file containing the data
	// for this artifact.
	Path            string
	ContentEncoding string
	ContentType     string
	// File is copied to a temp location, so that the content is frozen and
	// can't change during file upload etc
	TempCopyPath string
}

func (s3Artifact *S3Artifact) copyToTempFile(directory string, pd *process.PlatformData) (err error) {
	baseName := filepath.Base(s3Artifact.Path)
	var tempFile *os.File
	tempFile, err = os.CreateTemp("", "stage1-"+baseName)
	if err != nil {
		return
	}
	defer func() {
		err2 := tempFile.Close()
		if err == nil {
			err = err2
		}
	}()
	s3Artifact.TempCopyPath = tempFile.Name()
	var source *os.File
	source, err = os.Open(s3Artifact.Path)
	if err != nil {
		return
	}
	defer func() {
		err2 := source.Close()
		if err == nil {
			err = err2
		}
	}()
	_, err = io.Copy(tempFile, source)
	return
}

func (s3Artifact *S3Artifact) writeTransferContentToFile() (err error) {
	if s3Artifact.ContentEncoding != "gzip" {
		return
	}
	oldTempFile := s3Artifact.TempCopyPath
	baseName := filepath.Base(s3Artifact.Path)
	newTempFile, err := os.CreateTemp("", "stage2-"+baseName)
	if err != nil {
		return
	}
	defer func() {
		err2 := newTempFile.Close()
		if err == nil {
			err = err2
		}
	}()
	gzipLogWriter := gzip.NewWriter(newTempFile)
	defer func() {
		err2 := gzipLogWriter.Close()
		if err == nil {
			err = err2
		}
	}()
	gzipLogWriter.Name = baseName
	source, err := os.Open(oldTempFile)
	if err != nil {
		return
	}
	defer func() {
		err2 := source.Close()
		if err == nil {
			err = err2
		}
		s3Artifact.TempCopyPath = newTempFile.Name()
		err3 := os.Remove(oldTempFile)
		if err == nil {
			err = err3
		}
	}()
	_, err = io.Copy(gzipLogWriter, source)
	return
}

func (s3Artifact *S3Artifact) ProcessResponse(resp interface{}, logger Logger, serviceFactory tc.ServiceFactory, config *gwconfig.Config, directory string, pd *process.PlatformData) (err error) {
	response := resp.(*tcqueue.S3ArtifactResponse)

	logger.Infof("Uploading artifact %v from file %v with content encoding %q, mime type %q and expiry %v", s3Artifact.Name, s3Artifact.Path, s3Artifact.ContentEncoding, s3Artifact.ContentType, s3Artifact.Expires)

	err = s3Artifact.copyToTempFile(directory, pd)
	if err != nil {
		return
	}
	defer func(s3Artifact *S3Artifact) {
		err2 := os.Remove(s3Artifact.TempCopyPath)
		if err == nil {
			err = err2
		}
	}(s3Artifact)

	err = s3Artifact.writeTransferContentToFile()
	if err != nil {
		return
	}

	// perform http PUT to upload to S3...
	httpClient := &http.Client{}
	httpCall := func() (putResp *http.Response, tempError error, permError error) {
		var transferContent *os.File
		transferContent, permError = os.Open(s3Artifact.TempCopyPath)
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
	var putResp *http.Response
	var putAttempts int
	putResp, putAttempts, err = httpbackoff.Retry(httpCall)
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
	return
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
