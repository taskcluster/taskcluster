package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"mime"
	"net/http"
	"net/http/httputil"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/taskcluster-client-go/queue"
)

type (
	Artifact interface {
		Name() string
		ProcessResponse() error
		ResponseObject() interface{}
	}

	BaseArtifact struct {
		CanonicalPath string
		Expires       queue.Time
	}

	S3Artifact struct {
		BaseArtifact
		MimeType           string
		S3ArtifactRequest  queue.S3ArtifactRequest
		S3ArtifactResponse queue.S3ArtifactResponse
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

func (base BaseArtifact) Name() string {
	return base.CanonicalPath
}

func (artifact ErrorArtifact) ProcessResponse() error {
	// TODO: process error response
	return nil
}

func (artifact S3Artifact) ResponseObject() interface{} {
	return new(queue.S3ArtifactResponse)
}

func (artifact ErrorArtifact) ResponseObject() interface{} {
	return new(queue.ErrorArtifactResponse)
}

func (artifact S3Artifact) ProcessResponse() error {
	httpClient := &http.Client{}
	httpCall := func() (*http.Response, error, error) {
		// instead of using fileReader, read it into memory and then use a
		// bytes.Reader since then http.NewRequest will properly set
		// Content-Length header for us, which is needed by the API we call
		fileReader, err := os.Open(filepath.Join(TaskUser.HomeDir, artifact.CanonicalPath))
		requestPayload, err := ioutil.ReadAll(fileReader)
		if err != nil {
			return nil, nil, err
		}
		defer fileReader.Close()
		bytesReader := bytes.NewReader(requestPayload)
		// http.NewRequest automatically sets Content-Length correctly for bytes.Reader
		httpRequest, err := http.NewRequest("PUT", artifact.S3ArtifactResponse.PutUrl, bytesReader)
		if err != nil {
			return nil, nil, err
		}
		debug("MimeType in put request: %v", artifact.MimeType)
		httpRequest.Header.Set("Content-Type", artifact.MimeType)
		// request body could be a) binary and b) massive, so don't show it...
		requestFull, dumpError := httputil.DumpRequestOut(httpRequest, false)
		if dumpError != nil {
			debug("Could not dump request, never mind...")
		} else {
			debug("Request")
			debug(string(requestFull))
		}
		putResp, err := httpClient.Do(httpRequest)
		return putResp, err, nil
	}
	putResp, putAttempts, err := httpbackoff.Retry(httpCall)
	debug("%v put requests issued to %v", putAttempts, artifact.S3ArtifactResponse.PutUrl)
	respBody, dumpError := httputil.DumpResponse(putResp, true)
	if dumpError != nil {
		debug("Could not dump response output, never mind...")
	} else {
		debug("Response")
		debug(string(respBody))
	}
	return err
}

// Returns the artifacts as listed in the payload of the task (note this does
// not include log files)
func (task *TaskRun) PayloadArtifacts() []Artifact {
	artifacts := make([]Artifact, 0)
	debug("Artifacts:")
	for _, artifact := range task.Payload.Artifacts {
		base := BaseArtifact{
			CanonicalPath: canonicalPath(artifact.Path),
			Expires:       artifact.Expires,
		}
		// first check file exists!
		switch artifact.Type {
		case "file":
			artifacts = append(artifacts, resolve(base))
		case "directory":
			walkFn := func(path string, info os.FileInfo, err error) error {
				if !info.IsDir() {
					relativePath, err := filepath.Rel(TaskUser.HomeDir, path)
					if err != nil {
						debug("WIERD ERROR - skipping file: %s", err)
						return nil
					}
					b := BaseArtifact{
						CanonicalPath: relativePath,
						Expires:       artifact.Expires,
					}
					artifacts = append(artifacts, resolve(b))
				}
				return nil
			}
			filepath.Walk(filepath.Join(TaskUser.HomeDir, base.CanonicalPath), walkFn)
		}
	}
	return artifacts
}

// Pass in a BaseArtifact and it will return either an S3 Artifact if file
// exists and is readable, or an ErrorArtifact if not
func resolve(base BaseArtifact) Artifact {
	fileReader, err := os.Open(filepath.Join(TaskUser.HomeDir, base.CanonicalPath))
	defer fileReader.Close()
	if err != nil {
		// cannot read file, create an error artifact
		return ErrorArtifact{
			BaseArtifact: base,
			Message:      fmt.Sprintf("Could not read file '%s'", fileReader.Name()),
			// TODO: need to also handle "invalid-resource-on-worker"
			// TODO: need to also handle "too-large-file-on-worker"
			Reason: "file-missing-on-worker",
		}
	}
	mimeType := mime.TypeByExtension(filepath.Ext(base.CanonicalPath))
	// check we have a mime type!
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

func (task *TaskRun) uploadLog(logFile string) error {
	// logs expire after one year...
	logExpiry := queue.Time(time.Now().AddDate(1, 0, 0))
	log := S3Artifact{
		BaseArtifact: BaseArtifact{
			CanonicalPath: logFile,
			Expires:       logExpiry,
		},
		MimeType: "text/plain",
	}
	return task.uploadArtifact(log)
}

func (task *TaskRun) uploadArtifact(artifact Artifact) error {
	task.Artifacts = append(task.Artifacts, artifact)
	payload, err := json.Marshal(artifact)
	if err != nil {
		return err
	}
	par := queue.PostArtifactRequest(json.RawMessage(payload))
	parsp, callSummary := Queue.CreateArtifact(
		task.TaskId,
		strconv.Itoa(int(task.RunId)),
		artifact.Name(),
		&par,
	)
	if callSummary.Error != nil {
		debug("Could not upload artifact: %v", artifact)
		debug("%v", callSummary)
		debug("%v", parsp)
		debug("Request Headers")
		callSummary.HttpRequest.Header.Write(os.Stdout)
		debug("Request Body")
		debug(callSummary.HttpRequestBody)
		debug("Response Headers")
		callSummary.HttpResponse.Header.Write(os.Stdout)
		debug("Response Body")
		debug(callSummary.HttpResponseBody)
		return callSummary.Error
	}
	debug("Response body RAW")
	debug(callSummary.HttpResponseBody)
	debug("Response body INTERPRETED")
	debug(string(*parsp))
	// unmarshal response into object
	resp := artifact.ResponseObject()
	err = json.Unmarshal(json.RawMessage(*parsp), resp)
	if err != nil {
		return err
	}
	err = artifact.ProcessResponse()
	return err
}
