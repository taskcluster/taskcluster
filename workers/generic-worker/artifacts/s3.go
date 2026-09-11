package artifacts

import (
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"

	"github.com/taskcluster/httpbackoff/v3"
	"github.com/taskcluster/taskcluster/v108/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v108/internal/mocktc/tc"
	"github.com/taskcluster/taskcluster/v108/workers/generic-worker/gwconfig"
)

type S3Artifact struct {
	*BaseArtifact
	// Path is the filename of the file declared in the task payload.
	Path string
	// Content streams the data for this artifact.
	Content         ContentSource
	ContentEncoding string
	ContentType     string
	// ContentLength is the original file size in bytes, before any
	// encoding (e.g. gzip). Sent to the queue for monitoring purposes.
	ContentLength int64
	bodyPath      string
	bodySHA256    string
}

func (s3Artifact *S3Artifact) SourcePath() string {
	return s3Artifact.Path
}

func (s3Artifact *S3Artifact) PrepareContent() (err error) {
	s3Artifact.bodyPath, s3Artifact.bodySHA256, s3Artifact.ContentLength, err = s3Artifact.createTempFileForPUTBody()
	return err
}

func (s3Artifact *S3Artifact) DiscardContent() {
	if s3Artifact.bodyPath != "" {
		os.Remove(s3Artifact.bodyPath)
		s3Artifact.bodyPath = ""
		s3Artifact.bodySHA256 = ""
	}
}

// Streams the artifact content into a temporary file owned by the worker,
// applying ContentEncoding on the way. The path of the temporary file is
// returned, alongside the sha256 and the length of the uncompressed content
// that got written.
func (s3Artifact *S3Artifact) createTempFileForPUTBody() (path string, sha256sum string, contentLength int64, err error) {
	baseName := filepath.Base(s3Artifact.Path)
	tmpFile, err := os.CreateTemp("", "artifact-")
	if err != nil {
		return
	}
	defer func() {
		if err != nil {
			tmpFile.Close()
			if rmErr := os.Remove(tmpFile.Name()); rmErr != nil {
				log.Printf("WARNING: could not remove temporary file %v: %v", tmpFile.Name(), rmErr)
			}
		}
	}()
	var target io.Writer = tmpFile
	var gzipLogWriter *gzip.Writer
	if s3Artifact.ContentEncoding == "gzip" {
		gzipLogWriter = gzip.NewWriter(tmpFile)
		gzipLogWriter.Name = baseName
		target = gzipLogWriter
	}
	hasher := sha256.New()
	if contentLength, err = s3Artifact.Content.WriteContent(io.MultiWriter(target, hasher)); err != nil {
		return
	}
	if gzipLogWriter != nil {
		if err = gzipLogWriter.Close(); err != nil {
			return
		}
	}
	if err = tmpFile.Close(); err != nil {
		return
	}
	return tmpFile.Name(), hex.EncodeToString(hasher.Sum(nil)), contentLength, nil
}

func (s3Artifact *S3Artifact) ProcessResponse(resp any, logger Logger, serviceFactory tc.ServiceFactory, config *gwconfig.Config) (err error) {
	response := resp.(*tcqueue.S3ArtifactResponse)

	log.Printf("Uploading artifact %v from file %v with content encoding %q, mime type %q and expiry %v", s3Artifact.Name, s3Artifact.Path, s3Artifact.ContentEncoding, s3Artifact.ContentType, s3Artifact.Expires)

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
		transferContent, permError = os.Open(s3Artifact.bodyPath)
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
			return
		}
		return
	}
	putResp, putAttempts, err := httpbackoff.Retry(httpCall)
	if err == nil {
		s3Artifact.SHA256 = s3Artifact.bodySHA256
	}
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
	return fmt.Sprintf("S3 Artifact - Name: '%v', Path: '%v', Expires: %v, Content Encoding: '%v', MIME Type: '%v', Content Length: '%v'",
		s3Artifact.Name,
		s3Artifact.Path,
		s3Artifact.Expires,
		s3Artifact.ContentEncoding,
		s3Artifact.ContentType,
		s3Artifact.ContentLength,
	)
}
