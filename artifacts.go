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
		ProcessResponse(response interface{}) error
		RequestObject() interface{}
		ResponseObject() interface{}
		Base() BaseArtifact
	}

	BaseArtifact struct {
		CanonicalPath string
		Name          string
		Expires       tcclient.Time
	}

	S3Artifact struct {
		BaseArtifact
		MimeType        string
		ContentEncoding string
	}

	AzureArtifact struct {
		BaseArtifact
		MimeType string
	}

	RedirectArtifact struct {
		BaseArtifact
		MimeType string
		URL      string
	}

	ErrorArtifact struct {
		BaseArtifact
		Message string
		Reason  string
	}
)

func (base BaseArtifact) Base() BaseArtifact {
	return base
}

func (artifact RedirectArtifact) ProcessResponse(response interface{}) error {
	// nothing to do
	return nil
}

func (redirectArtifact RedirectArtifact) RequestObject() interface{} {
	return &queue.RedirectArtifactRequest{
		ContentType: redirectArtifact.MimeType,
		Expires:     redirectArtifact.Expires,
		StorageType: "reference",
		URL:         redirectArtifact.URL,
	}
}

func (redirectArtifact RedirectArtifact) ResponseObject() interface{} {
	return new(queue.RedirectArtifactResponse)
}

func (artifact ErrorArtifact) ProcessResponse(response interface{}) error {
	// TODO: process error response
	return nil
}

func (errArtifact ErrorArtifact) RequestObject() interface{} {
	return &queue.ErrorArtifactRequest{
		Expires:     errArtifact.Expires,
		Message:     errArtifact.Message,
		Reason:      errArtifact.Reason,
		StorageType: "error",
	}
}

func (errArtifact ErrorArtifact) ResponseObject() interface{} {
	return new(queue.ErrorArtifactResponse)
}

// gzipCompressFile gzip-compresses the file at path rawContentFile and writes
// it to a temporary file. The file path of the generated temporary file is returned.
// It is the responsibility of the caller to delete the temporary file.
func gzipCompressFile(rawContentFile string) string {
	baseName := filepath.Base(rawContentFile)
	tmpFile, err := ioutil.TempFile("", baseName)
	if err != nil {
		log.Fatal(err)
	}
	defer tmpFile.Close()
	gzipLogWriter := gzip.NewWriter(tmpFile)
	gzipLogWriter.Name = baseName
	rawContent, err := os.Open(rawContentFile)
	if err != nil {
		panic(err)
	}
	defer rawContent.Close()
	io.Copy(gzipLogWriter, rawContent)
	gzipLogWriter.Close()
	return tmpFile.Name()
}

func (artifact S3Artifact) ProcessResponse(resp interface{}) (err error) {
	response := resp.(*queue.S3ArtifactResponse)
	rawContentFile := filepath.Join(taskContext.TaskDir, artifact.CanonicalPath)

	// if Content-Encoding is gzip then we will need to gzip content...
	transferContentFile := rawContentFile
	if artifact.ContentEncoding == "gzip" {
		transferContentFile = gzipCompressFile(rawContentFile)
		defer os.Remove(transferContentFile)
	}

	// perform http PUT to upload to S3...
	httpClient := &http.Client{}
	httpCall := func() (*http.Response, error, error) {
		transferContent, err := os.Open(transferContentFile)
		if err != nil {
			return nil, nil, err
		}
		defer transferContent.Close()
		transferContentFileInfo, err := transferContent.Stat()
		if err != nil {
			return nil, nil, err
		}
		transferContentLength := transferContentFileInfo.Size()

		httpRequest, err := http.NewRequest("PUT", response.PutURL, transferContent)
		if err != nil {
			return nil, nil, err
		}
		httpRequest.Header.Set("Content-Type", artifact.MimeType)
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
		putResp, err := httpClient.Do(httpRequest)
		return putResp, err, nil
	}
	putResp, putAttempts, err := httpbackoff.Retry(httpCall)
	defer putResp.Body.Close()
	log.Printf("%v put requests issued to %v", putAttempts, response.PutURL)
	respBody, dumpError := httputil.DumpResponse(putResp, true)
	if dumpError != nil {
		log.Print("Could not dump response output, never mind...")
	} else {
		log.Print("Response")
		log.Print(string(respBody))
	}
	return err
}

func (s3Artifact S3Artifact) RequestObject() interface{} {
	return &queue.S3ArtifactRequest{
		ContentType: s3Artifact.MimeType,
		Expires:     s3Artifact.Expires,
		StorageType: "s3",
	}
}

func (s3Artifact S3Artifact) ResponseObject() interface{} {
	return new(queue.S3ArtifactResponse)
}

// Returns the artifacts as listed in the payload of the task (note this does
// not include log files)
func (task *TaskRun) PayloadArtifacts() []Artifact {
	artifacts := make([]Artifact, 0)
	for _, artifact := range task.Payload.Artifacts {
		base := BaseArtifact{
			CanonicalPath: canonicalPath(artifact.Path),
			Name:          artifact.Name,
			Expires:       artifact.Expires,
		}
		// if no name given, use canonical path
		if base.Name == "" {
			base.Name = base.CanonicalPath
		}
		switch artifact.Type {
		case "file":
			artifacts = append(artifacts, resolve(base, "file"))
		case "directory":
			if errArtifact := resolve(base, "directory"); errArtifact != nil {
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
				relativePath, err := filepath.Rel(base.CanonicalPath, subPath)
				if err != nil {
					// this indicates a bug in the code
					panic(err)
				}
				subName := filepath.Join(base.Name, relativePath)
				b := BaseArtifact{
					CanonicalPath: canonicalPath(subPath),
					Name:          canonicalPath(subName),
					Expires:       artifact.Expires,
				}
				switch {
				case info.IsDir():
					if errArtifact := resolve(b, "directory"); errArtifact != nil {
						artifacts = append(artifacts, errArtifact)
					}
				default:
					artifacts = append(artifacts, resolve(b, "file"))
				}
				return nil
			}
			filepath.Walk(filepath.Join(taskContext.TaskDir, base.CanonicalPath), walkFn)
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
func resolve(base BaseArtifact, artifactType string) Artifact {
	fullPath := filepath.Join(taskContext.TaskDir, base.CanonicalPath)
	fileReader, err := os.Open(fullPath)
	if err != nil {
		// cannot read file/dir, create an error artifact
		return ErrorArtifact{
			BaseArtifact: base,
			Message:      fmt.Sprintf("Could not read %s '%s'", artifactType, fullPath),
			Reason:       "file-missing-on-worker",
		}
	}
	defer fileReader.Close()
	// ok it exists, but is it right type?
	fileinfo, err := fileReader.Stat()
	if err != nil {
		return ErrorArtifact{
			BaseArtifact: base,
			Message:      fmt.Sprintf("Could not stat %s '%s'", artifactType, fullPath),
			Reason:       "invalid-resource-on-worker",
		}
	}
	if artifactType == "file" && fileinfo.IsDir() {
		return ErrorArtifact{
			BaseArtifact: base,
			Message:      fmt.Sprintf("File artifact '%s' exists as a directory, not a file, on the worker", fullPath),
			Reason:       "invalid-resource-on-worker",
		}
	}
	if artifactType == "directory" && !fileinfo.IsDir() {
		return ErrorArtifact{
			BaseArtifact: base,
			Message:      fmt.Sprintf("Directory artifact '%s' exists as a file, not a directory, on the worker", fullPath),
			Reason:       "invalid-resource-on-worker",
		}
	}
	if artifactType == "directory" {
		return nil
	}
	extension := filepath.Ext(base.CanonicalPath)
	// first look up our own custom mime type mappings
	mimeType := customMimeMappings[strings.ToLower(extension)]
	// then fall back to system mime type mappings
	if mimeType == "" {
		mimeType = mime.TypeByExtension(extension)
	}
	// lastly, fall back to application/octet-stream in the absense of any other value
	if mimeType == "" {
		// application/octet-stream is the mime type for "unknown"
		mimeType = "application/octet-stream"
	}
	return S3Artifact{
		BaseArtifact: base,
		MimeType:     mimeType,
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

func (task *TaskRun) uploadLog(logFile string) *CommandExecutionError {
	return task.uploadArtifact(
		S3Artifact{
			BaseArtifact: BaseArtifact{
				CanonicalPath: logFile,
				Name:          logFile,
				// logs expire when task expires
				Expires: task.Definition.Expires,
			},
			MimeType:        "text/plain; charset=utf-8",
			ContentEncoding: "gzip",
		},
	)
}

func (task *TaskRun) uploadArtifact(artifact Artifact) *CommandExecutionError {
	log.Print("Uploading artifact: " + artifact.Base().CanonicalPath)
	task.Artifacts = append(task.Artifacts, artifact)
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
		case *os.PathError:
			// artifact does not exist or is not readable...
			return Failure(err)
		case httpbackoff.BadHttpResponseCode:
			if t.HttpResponseCode/100 == 5 {
				return ResourceUnavailable(fmt.Errorf("TASK EXCEPTION due to response code %v from Queue when uploading artifact %#v", t.HttpResponseCode, artifact))
			} else {
				// if not a 5xx error, then either task cancelled, or a problem with the request == worker bug
				task.StatusManager.UpdateStatus()
				status := task.StatusManager.LastKnownStatus()
				if status == deadlineExceeded || status == cancelled {
					return nil
				}
				panic(fmt.Errorf("TASK FAIL due to response code %v from Queue when uploading artifact %#v", t.HttpResponseCode, artifact))
			}
		default:
			panic(fmt.Errorf("TASK EXCEPTION due to non-recoverable error when uploading artifact: %#v", t))
		}
	}
	// unmarshal response into object
	resp := artifact.ResponseObject()
	e := json.Unmarshal(json.RawMessage(*parsp), resp)
	if e != nil {
		panic(e)
	}
	// note: this only returns an error, if ProcessResponse returns an error...
	return ResourceUnavailable(artifact.ProcessResponse(resp))
}
