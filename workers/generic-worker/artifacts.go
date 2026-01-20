package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/url"
	"runtime"
	"strconv"
	"strings"

	"github.com/taskcluster/httpbackoff/v3"
	tcurls "github.com/taskcluster/taskcluster-lib-urls"
	tcclient "github.com/taskcluster/taskcluster/v96/clients/client-go"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/artifacts"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/process"
)

var (
	// for overriding/complementing system mime type mappings
	customMimeMappings = map[string]string{

		// keys *must* be lower-case

		".log": "text/plain",
	}
)

// createDataArtifact creates a TaskArtifact for the given data, according to
// the CreateObjectArtifacts configuration.
//
// The contentEncoding is a suggestion as to the encoding to use for the data.
// The data in the file at 'path' must _not_ already have this encoding applied.
func createDataArtifact(
	base *artifacts.BaseArtifact,
	path string,
	contentPath string,
	contentType string,
	contentEncoding string,
) artifacts.TaskArtifact {
	if config.CreateObjectArtifacts {
		// note that contentEncoding is currently ignored for object artifacts
		return &artifacts.ObjectArtifact{
			BaseArtifact: base,
			Path:         path,
			ContentType:  contentType,
		}
	}

	return &artifacts.S3Artifact{
		BaseArtifact:    base,
		Path:            path,
		ContentPath:     contentPath,
		ContentType:     contentType,
		ContentEncoding: contentEncoding,
	}
}

func (task *TaskRun) uploadLog(name, path string) *CommandExecutionError {
	return task.uploadArtifact(
		createDataArtifact(
			&artifacts.BaseArtifact{
				Name: name,
				// logs expire when task expires
				Expires: task.Definition.Expires,
			},
			path,
			path,
			"text/plain; charset=utf-8",
			"gzip",
		),
	)
}

func (task *TaskRun) uploadArtifact(artifact artifacts.TaskArtifact) *CommandExecutionError {
	task.artifactsMux.Lock()
	task.Artifacts[artifact.Base().Name] = artifact
	task.artifactsMux.Unlock()
	payload, err := json.Marshal(artifact.RequestObject())
	if err != nil {
		panic(err)
	}
	par := tcqueue.PostArtifactRequest(json.RawMessage(payload))
	task.queueMux.RLock()
	parsp, err := task.Queue.CreateArtifact(
		task.TaskID,
		strconv.Itoa(int(task.RunID)),
		artifact.Base().Name,
		&par,
	)
	task.queueMux.RUnlock()
	if err != nil {
		switch t := err.(type) {
		case *tcclient.APICallException:
			switch rootCause := t.RootCause.(type) {
			case httpbackoff.BadHttpResponseCode:
				if rootCause.HttpResponseCode/100 == 5 {
					return ResourceUnavailable(fmt.Errorf("TASK EXCEPTION due to response code %v from Queue when uploading artifact %#v with CreateArtifact payload %v - HTTP response body: %v", rootCause.HttpResponseCode, artifact, string(payload), t.CallSummary.HTTPResponseBody))
				}
				// was artifact already uploaded ( => malformed payload)?
				if rootCause.HttpResponseCode == 409 {
					fullError := fmt.Errorf(
						"there was a conflict uploading artifact %v - this suggests artifact %v was already uploaded to this task with different content earlier on in this task.\n"+
							"Check the artifacts section of the task payload at %v\n"+
							"%v",
						artifact.Base().Name,
						artifact.Base().Name,
						tcurls.API(config.RootURL, "queue", "v1", "task/"+task.TaskID),
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
				panic(fmt.Errorf("WORKER EXCEPTION due to response code %v from Queue when uploading artifact %#v with CreateArtifact payload %v - HTTP response body: %v", rootCause.HttpResponseCode, artifact, string(payload), t.CallSummary.HTTPResponseBody))
			case *url.Error:
				switch subCause := rootCause.Err.(type) {
				case *net.OpError:
					log.Printf("Got *net.OpError - probably got no network at the moment: %#v", *subCause)
					return nil
				default:
					panic(fmt.Errorf("WORKER EXCEPTION due to unexpected *url.Error when requesting url from queue to upload artifact to: %#v", subCause))
				}
			default:
				panic(fmt.Errorf("WORKER EXCEPTION due to *tcclient.APICallException error when requesting url from queue to upload artifact to. Root cause: %#v", rootCause))
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
	e = artifact.ProcessResponse(resp, task, serviceFactory, config)
	if e != nil {
		task.Errorf("Error uploading artifact: %v", e)
		return ResourceUnavailable(e)
	}

	e = artifact.FinishArtifact(resp, task.Queue, task.TaskID, strconv.Itoa(int(task.RunID)), artifact.Base().Name)
	if e != nil {
		task.Errorf("Error finishing artifact: %v", e)
		return ResourceUnavailable(e)
	}

	return nil
}

func copyToTempFileAsTaskUser(filePath string, pd *process.PlatformData) (tempFilePath string, err error) {
	tempFilePath, err = gwCopyToTempFile(filePath, pd)

	if runtime.GOOS == "windows" {
		// Windows syscall logs are sent to stdout, even though the code appears
		// to send to stderr through the log package.
		// TODO: Figure out why this is the case and remove this hack.
		// https://github.com/taskcluster/taskcluster/issues/6677
		//
		// We need to get the filepath from the final line of output.
		//
		// Example output:
		// 2023/11/07 19:56:06Z Making system call GetProfilesDirectoryW with args: [C0000C15F0 C00027E980]
		// 2023/11/07 19:56:06Z   Result: 1 0 The operation completed successfully.
		// C:\Windows\SystemTemp\TestPrivilegedFileUpload664016823956663638
		outputLines := strings.Split(tempFilePath, "\n")
		tempFilePath = strings.TrimSpace(outputLines[len(outputLines)-1])
	}

	return
}
