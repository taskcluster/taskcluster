package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"mime"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/stateless-dns-go/hostname"
	"github.com/taskcluster/taskcluster-client-go/queue"
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
		Expires       queue.Time
	}

	S3Artifact struct {
		BaseArtifact
		MimeType string
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
		Url:         redirectArtifact.URL,
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

func (artifact S3Artifact) ProcessResponse(resp interface{}) error {
	response := resp.(*queue.S3ArtifactResponse)
	httpClient := &http.Client{}
	httpCall := func() (*http.Response, error, error) {
		// instead of using fileReader, read it into memory and then use a
		// bytes.Reader since then http.NewRequest will properly set
		// Content-Length header for us, which is needed by the API we call
		fileReader, err := os.Open(filepath.Join(TaskUser.HomeDir, artifact.Base().CanonicalPath))
		requestPayload, err := ioutil.ReadAll(fileReader)
		if err != nil {
			return nil, nil, err
		}
		defer fileReader.Close()
		bytesReader := bytes.NewReader(requestPayload)
		// http.NewRequest automatically sets Content-Length correctly for bytes.Reader
		httpRequest, err := http.NewRequest("PUT", response.PutUrl, bytesReader)
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
	debug("%v put requests issued to %v", putAttempts, response.PutUrl)
	respBody, dumpError := httputil.DumpResponse(putResp, true)
	if dumpError != nil {
		debug("Could not dump response output, never mind...")
	} else {
		debug("Response")
		debug(string(respBody))
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
	debug("Artifacts:")
	for _, artifact := range task.Payload.Artifacts {
		base := BaseArtifact{
			CanonicalPath: canonicalPath(artifact.Path),
			Expires:       artifact.Expires,
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
				relativePath, err := filepath.Rel(TaskUser.HomeDir, path)
				if err != nil {
					debug("WIERD ERROR - skipping file: %s", err)
					return nil
				}
				b := BaseArtifact{
					CanonicalPath: relativePath,
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
			filepath.Walk(filepath.Join(TaskUser.HomeDir, base.CanonicalPath), walkFn)
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
	fullPath := filepath.Join(TaskUser.HomeDir, base.CanonicalPath)
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

func (task *TaskRun) uploadLiveLog(logFile string) error {
	// deduce stateless DNS name to use
	maxRunTimeDeadline := time.Now().Add(time.Duration(task.Payload.MaxRunTime) * time.Second)
	statelessHostname, err := hostname.New(config.PublicIP, config.SubDomain, maxRunTimeDeadline, config.LiveLogSecret)
	getURL, err := url.Parse(task.liveLog.GetURL)
	if err != nil {
		return err
	}
	getURL.Scheme = "https"
	getURL.Host = statelessHostname + ":32774"
	return task.uploadArtifact(
		RedirectArtifact{
			BaseArtifact: BaseArtifact{
				CanonicalPath: logFile + ".live",
				// livelog expires when task must have completed
				Expires: queue.Time(maxRunTimeDeadline),
			},
			MimeType: "text/plain; charset=utf-8",
			URL:      getURL.String(),
		},
	)
}

func (task *TaskRun) uploadLog(logFile string) error {
	return task.uploadArtifact(
		S3Artifact{
			BaseArtifact: BaseArtifact{
				CanonicalPath: logFile,
				// logs expire when task expires
				Expires: task.Definition.Expires,
			},
			MimeType: "text/plain; charset=utf-8",
		},
	)
}

func (task *TaskRun) uploadArtifact(artifact Artifact) error {
	debug("Uploading artifact: " + artifact.Base().CanonicalPath)
	task.Artifacts = append(task.Artifacts, artifact)
	payload, err := json.Marshal(artifact.RequestObject())
	if err != nil {
		return err
	}
	par := queue.PostArtifactRequest(json.RawMessage(payload))
	parsp, callSummary, err := Queue.CreateArtifact(
		task.TaskId,
		strconv.Itoa(int(task.RunId)),
		artifact.Base().CanonicalPath,
		&par,
	)
	if err != nil {
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
		return err
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
	return artifact.ProcessResponse(resp)
}
