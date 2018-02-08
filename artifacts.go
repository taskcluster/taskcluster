package main

import (
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"mime"
	"net/http"
	"net/http/httputil"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/taskcluster/httpbackoff"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/queue"
)

var (
	// for overriding/complementing system mime type mappings
	customMimeMappings map[string]string = map[string]string{

		// keys *must* be lower-case

		".log": "text/plain",
	}
)

type (
	Artifact interface {
		ProcessResponse(response interface{}, task *TaskRun) error
		RequestObject() interface{}
		ResponseObject() interface{}
		Base() *BaseArtifact
	}

	BaseArtifact struct {
		Name        string
		Expires     tcclient.Time
		ContentType string
	}

	S3Artifact struct {
		*BaseArtifact
		Path            string
		ContentEncoding string
	}

	AzureArtifact struct {
		*BaseArtifact
		Path string
	}

	RedirectArtifact struct {
		*BaseArtifact
		URL string
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

func (artifact *RedirectArtifact) ProcessResponse(response interface{}, task *TaskRun) error {
	task.Infof("Uploading redirect artifact %v to URL %v with mime type %q and expiry %v", artifact.Name, artifact.URL, artifact.ContentType, artifact.Expires)
	// nothing to do
	return nil
}

func (redirectArtifact *RedirectArtifact) RequestObject() interface{} {
	return &queue.RedirectArtifactRequest{
		ContentType: redirectArtifact.ContentType,
		Expires:     redirectArtifact.Expires,
		StorageType: "reference",
		URL:         redirectArtifact.URL,
	}
}

func (redirectArtifact *RedirectArtifact) ResponseObject() interface{} {
	return new(queue.RedirectArtifactResponse)
}

func (artifact *ErrorArtifact) ProcessResponse(response interface{}, task *TaskRun) error {
	task.Errorf("Uploading error artifact %v from file %v with message %q, reason %q and expiry %v", artifact.Name, artifact.Path, artifact.Message, artifact.Reason, artifact.Expires)
	// TODO: process error response
	return nil
}

func (errArtifact *ErrorArtifact) RequestObject() interface{} {
	return &queue.ErrorArtifactRequest{
		Expires:     errArtifact.Expires,
		Message:     errArtifact.Message,
		Reason:      errArtifact.Reason,
		StorageType: "error",
	}
}

func (errArtifact *ErrorArtifact) ResponseObject() interface{} {
	return new(queue.ErrorArtifactResponse)
}

func (errArtifact *ErrorArtifact) String() string {
	return fmt.Sprintf("%q", *errArtifact)
}

// createTempFileForPUTBody gzip-compresses the file at path rawContentFile and writes
// it to a temporary file. The file path of the generated temporary file is returned.
// It is the responsibility of the caller to delete the temporary file.
func (artifact *S3Artifact) CreateTempFileForPUTBody() string {
	rawContentFile := filepath.Join(taskContext.TaskDir, artifact.Path)
	baseName := filepath.Base(rawContentFile)
	tmpFile, err := ioutil.TempFile("", baseName)
	if err != nil {
		panic(err)
	}
	defer tmpFile.Close()
	var target io.Writer = tmpFile
	if artifact.ContentEncoding == "gzip" {
		gzipLogWriter := gzip.NewWriter(tmpFile)
		defer gzipLogWriter.Close()
		gzipLogWriter.Name = baseName
		target = gzipLogWriter
	}
	source, err := os.Open(rawContentFile)
	if err != nil {
		panic(err)
	}
	defer source.Close()
	io.Copy(target, source)
	return tmpFile.Name()
}

func (artifact *S3Artifact) ChooseContentEncoding() {
	// respect value, if already set
	if artifact.ContentEncoding != "" {
		return
	}
	// based on https://github.com/evansd/whitenoise/blob/03f6ea846394e01cbfe0c730141b81eb8dd6e88a/whitenoise/compress.py#L21-L29
	// with .7z added (useful for NSS)
	SKIP_COMPRESS_EXTENSIONS := map[string]bool{
		// Images
		".jpg":  true,
		".jpeg": true,
		".png":  true,
		".gif":  true,
		".webp": true,
		// Compressed files
		".7z":  true,
		".zip": true,
		".gz":  true,
		".tgz": true,
		".bz2": true,
		".tbz": true,
		".whl": true, // Python wheel are already zip file
		".xz":  true,
		// Flash
		".swf": true,
		".flv": true,
		// Fonts
		".woff":  true,
		".woff2": true,
	}
	if SKIP_COMPRESS_EXTENSIONS[filepath.Ext(artifact.Path)] {
		return
	}

	artifact.ContentEncoding = "gzip"
}

func (artifact *S3Artifact) ProcessResponse(resp interface{}, task *TaskRun) (err error) {
	response := resp.(*queue.S3ArtifactResponse)

	artifact.ChooseContentEncoding()
	task.Infof("Uploading artifact %v from file %v with content encoding %q, mime type %q and expiry %v", artifact.Name, artifact.Path, artifact.ContentEncoding, artifact.ContentType, artifact.Expires)
	transferContentFile := artifact.CreateTempFileForPUTBody()
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
		httpRequest.Header.Set("Content-Type", artifact.ContentType)
		httpRequest.ContentLength = transferContentLength
		if enc := artifact.ContentEncoding; enc != "" {
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
	return &queue.S3ArtifactRequest{
		ContentType: s3Artifact.ContentType,
		Expires:     s3Artifact.Expires,
		StorageType: "s3",
	}
}

func (s3Artifact *S3Artifact) ResponseObject() interface{} {
	return new(queue.S3ArtifactResponse)
}

func (s3Artifact *S3Artifact) String() string {
	return fmt.Sprintf("S3 Artifact - Name: '%v', Path: '%v', Expires: %v, Content Encoding: '%v', MIME Type: '%v'", s3Artifact.Name, s3Artifact.Path, s3Artifact.Expires, s3Artifact.ContentEncoding, s3Artifact.ContentType)
}

// Returns the artifacts as listed in the payload of the task (note this does
// not include log files)
func (task *TaskRun) PayloadArtifacts() []Artifact {
	artifacts := make([]Artifact, 0)
	for _, artifact := range task.Payload.Artifacts {
		basePath := artifact.Path
		base := &BaseArtifact{
			Name:        artifact.Name,
			Expires:     artifact.Expires,
			ContentType: artifact.ContentType,
		}
		// if no name given, use canonical path
		if base.Name == "" {
			base.Name = canonicalPath(basePath)
		}
		// default expiry should be task expiry
		if time.Time(base.Expires).IsZero() {
			base.Expires = task.Definition.Expires
		}
		switch artifact.Type {
		case "file":
			artifacts = append(artifacts, resolve(base, "file", basePath))
		case "directory":
			if errArtifact := resolve(base, "directory", basePath); errArtifact != nil {
				artifacts = append(artifacts, errArtifact)
				continue
			}
			walkFn := func(path string, info os.FileInfo, incomingErr error) error {
				// I think we don't need to handle incomingErr != nil since
				// resolve(...) gets called which should catch the same issues
				// raised in incomingErr - *** I GUESS *** !!
				subPath, err := filepath.Rel(taskContext.TaskDir, path)
				if err != nil {
					// this indicates a bug in the code
					panic(err)
				}
				relativePath, err := filepath.Rel(basePath, subPath)
				if err != nil {
					// this indicates a bug in the code
					panic(err)
				}
				subName := filepath.Join(base.Name, relativePath)
				b := &BaseArtifact{
					Name:        canonicalPath(subName),
					Expires:     base.Expires,
					ContentType: base.ContentType,
				}
				switch {
				case info.IsDir():
					if errArtifact := resolve(b, "directory", subPath); errArtifact != nil {
						artifacts = append(artifacts, errArtifact)
					}
				default:
					artifacts = append(artifacts, resolve(b, "file", subPath))
				}
				return nil
			}
			filepath.Walk(filepath.Join(taskContext.TaskDir, basePath), walkFn)
		}
	}
	return artifacts
}

// File should be resolved as an S3Artifact if file exists as file and is
// readable, otherwise i) if it does not exist or ii) cannot be read, as a
// "file-missing-on-worker" ErrorArtifact, otherwise if it exists as a
// directory, as "invalid-resource-on-worker" ErrorArtifact. A directory should
// resolve as `nil` if directory exists as directory and is readable, otherwise
// i) if it does not exist or ii) cannot be read, as a "file-missing-on-worker"
// ErrorArtifact, otherwise if it exists as a file, as
// "invalid-resource-on-worker" ErrorArtifact
// TODO: need to also handle "too-large-file-on-worker"
func resolve(base *BaseArtifact, artifactType string, path string) Artifact {
	fullPath := filepath.Join(taskContext.TaskDir, path)
	fileReader, err := os.Open(fullPath)
	if err != nil {
		// cannot read file/dir, create an error artifact
		return &ErrorArtifact{
			BaseArtifact: base,
			Message:      fmt.Sprintf("Could not read %s '%s'", artifactType, fullPath),
			Reason:       "file-missing-on-worker",
			Path:         path,
		}
	}
	defer fileReader.Close()
	// ok it exists, but is it right type?
	fileinfo, err := fileReader.Stat()
	if err != nil {
		return &ErrorArtifact{
			BaseArtifact: base,
			Message:      fmt.Sprintf("Could not stat %s '%s'", artifactType, fullPath),
			Reason:       "invalid-resource-on-worker",
			Path:         path,
		}
	}
	if artifactType == "file" && fileinfo.IsDir() {
		return &ErrorArtifact{
			BaseArtifact: base,
			Message:      fmt.Sprintf("File artifact '%s' exists as a directory, not a file, on the worker", fullPath),
			Reason:       "invalid-resource-on-worker",
			Path:         path,
		}
	}
	if artifactType == "directory" && !fileinfo.IsDir() {
		return &ErrorArtifact{
			BaseArtifact: base,
			Message:      fmt.Sprintf("Directory artifact '%s' exists as a file, not a directory, on the worker", fullPath),
			Reason:       "invalid-resource-on-worker",
			Path:         path,
		}
	}
	if artifactType == "directory" {
		return nil
	}
	if base.ContentType == "" {
		extension := filepath.Ext(path)
		// first look up our own custom mime type mappings
		base.ContentType = customMimeMappings[strings.ToLower(extension)]
		// then fall back to system mime type mappings
		if base.ContentType == "" {
			base.ContentType = mime.TypeByExtension(extension)
		}
		// lastly, fall back to application/octet-stream in the absense of any other value
		if base.ContentType == "" {
			// application/octet-stream is the mime type for "unknown"
			base.ContentType = "application/octet-stream"
		}
	}
	return &S3Artifact{
		BaseArtifact: base,
		Path:         path,
	}
}

// The Queue expects paths to use a forward slash, so let's make sure we have a
// way to generate a path in this format
func canonicalPath(path string) string {
	if os.PathSeparator == '/' {
		return path
	}
	return strings.Replace(path, string(os.PathSeparator), "/", -1)
}

func (task *TaskRun) uploadLog(name, path string) *CommandExecutionError {
	return task.uploadArtifact(
		&S3Artifact{
			BaseArtifact: &BaseArtifact{
				Name: name,
				// logs expire when task expires
				Expires:     task.Definition.Expires,
				ContentType: "text/plain; charset=utf-8",
			},
			Path:            path,
			ContentEncoding: "gzip",
		},
	)
}

func (task *TaskRun) uploadArtifact(artifact Artifact) *CommandExecutionError {
	task.Artifacts[artifact.Base().Name] = artifact
	payload, err := json.Marshal(artifact.RequestObject())
	if err != nil {
		panic(err)
	}
	par := queue.PostArtifactRequest(json.RawMessage(payload))
	parsp, err := task.Queue.CreateArtifact(
		task.TaskID,
		strconv.Itoa(int(task.RunID)),
		artifact.Base().Name,
		&par,
	)
	if err != nil {
		switch t := err.(type) {
		case *tcclient.APICallException:
			log.Print(t.CallSummary.String())
			switch rootCause := t.RootCause.(type) {
			case httpbackoff.BadHttpResponseCode:
				if rootCause.HttpResponseCode/100 == 5 {
					return ResourceUnavailable(fmt.Errorf("TASK EXCEPTION due to response code %v from Queue when uploading artifact %#v with CreateArtifact payload %v", rootCause.HttpResponseCode, artifact, string(payload)))
				} else {
					// was artifact already uploaded ( => malformed payload)?
					if rootCause.HttpResponseCode == 409 {
						fullError := fmt.Errorf(
							"There was a conflict uploading artifact %v - this suggests artifact %v was already uploaded to this task with different content earlier on in this task.\n"+
								"Check the artifacts section of the task payload at https://queue.taskcluster.net/v1/task/%v\n"+
								"%v",
							artifact.Base().Name,
							artifact.Base().Name,
							task.TaskID,
							rootCause,
						)
						return MalformedPayloadError(fullError)
					}
					// was task cancelled or deadline exceeded?
					task.StatusManager.UpdateStatus()
					status := task.StatusManager.LastKnownStatus()
					if status == deadlineExceeded || status == cancelled {
						return nil
					}
					// assume a problem with the request == worker bug
					panic(fmt.Errorf("WORKER EXCEPTION due to response code %v from Queue when uploading artifact %#v with CreateArtifact payload %v", rootCause.HttpResponseCode, artifact, string(payload)))
				}
			default:
				panic(fmt.Errorf("WORKER EXCEPTION due to non-recoverable error when requesting url from queue to upload artifact to: %#v", rootCause))
			}
		default:
			panic(fmt.Errorf("WORKER EXCEPTION due to non-recoverable error when requesting url from queue to upload artifact to: %#v", t))
		}
	}
	// unmarshal response into object
	resp := artifact.ResponseObject()
	e := json.Unmarshal(*parsp, resp)
	if e != nil {
		panic(e)
	}
	e = artifact.ProcessResponse(resp, task)
	// note: this only returns an error, if ProcessResponse returns an error...
	if e != nil {
		task.Errorf("Error uploading artifact: %v", e)
	}
	return ResourceUnavailable(e)
}
