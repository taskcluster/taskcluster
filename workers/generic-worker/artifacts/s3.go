package artifacts

import (
	"compress/gzip"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"

	"github.com/taskcluster/httpbackoff/v3"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v96/internal/mocktc/tc"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/gwconfig"
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
	// ContentLength is the original file size in bytes, before any
	// encoding (e.g. gzip). Sent to the queue for monitoring purposes.
	ContentLength int64
}

// createTempFileForPUTBody gzip-compresses the file at Path and
// writes it to a temporary file in the same directory. The file path of the
// generated temporary file is returned.  It is the responsibility of the
// caller to delete the temporary file.
func (s3Artifact *S3Artifact) createTempFileForPUTBody() string {
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
	return tmpFile.Name()
}

func (s3Artifact *S3Artifact) ProcessResponse(resp any, logger Logger, serviceFactory tc.ServiceFactory, config *gwconfig.Config) (err error) {
	response := resp.(*tcqueue.S3ArtifactResponse)

	log.Printf("Uploading artifact %v from file %v with content encoding %q, mime type %q and expiry %v", s3Artifact.Name, s3Artifact.Path, s3Artifact.ContentEncoding, s3Artifact.ContentType, s3Artifact.Expires)

	// Artifacts declared in payload are copied to a temp file
	// as task user to ensure they are readable by task user.
	// Reserved artifacts (created by task features) are not,
	// since their file location is not user-defined, and task
	// user cannot replace their content with symbolic links.
	// Thus reserved (trusted) artifacts have Path == ContentPath.
	tempFileCreated := s3Artifact.Path != s3Artifact.ContentPath
	if tempFileCreated {
		defer os.Remove(s3Artifact.ContentPath)
	}

	var transferContentFile string
	if !tempFileCreated || s3Artifact.ContentEncoding == "gzip" {
		log.Printf("Copying %v to temp file...", s3Artifact.ContentPath)
		transferContentFile = s3Artifact.createTempFileForPUTBody()
		defer os.Remove(transferContentFile)
	} else {
		log.Printf("Not copying %v to temp file", s3Artifact.ContentPath)
		transferContentFile = s3Artifact.ContentPath
	}

	// perform http PUT to upload to S3...
	httpClient := &http.Client{}
	formatURL := func(rawUrl string) (string, error) {
		parsedUrl, err := url.ParseRequestURI(rawUrl)
		if err != nil {
			return "", err
		}

		return fmt.Sprintf("%s://%s%s?<redacted>", parsedUrl.Scheme, parsedUrl.Host, parsedUrl.Path), nil
	}
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
	formattedUrl, formatURLErr := formatURL(response.PutURL)
	if formatURLErr != nil {
		log.Print("Could not parse PutUrl, something has gone very wrong...")
	} else {
		log.Printf("%v put requests issued to %v", putAttempts, formattedUrl)
	}

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

func (s3Artifact *S3Artifact) RequestObject() any {
	return &tcqueue.S3ArtifactRequest{
		ContentType:   s3Artifact.ContentType,
		ContentLength: s3Artifact.ContentLength,
		Expires:       s3Artifact.Expires,
		StorageType:   "s3",
	}
}

func (s3Artifact *S3Artifact) ResponseObject() any {
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
