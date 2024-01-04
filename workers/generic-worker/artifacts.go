package main

import (
	"encoding/json"
	"fmt"
	"log"
	"mime"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/taskcluster/httpbackoff/v3"
	tcurls "github.com/taskcluster/taskcluster-lib-urls"
	tcclient "github.com/taskcluster/taskcluster/v59/clients/client-go"
	"github.com/taskcluster/taskcluster/v59/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v59/workers/generic-worker/artifacts"
	"github.com/taskcluster/taskcluster/v59/workers/generic-worker/fileutil"
)

var (
	// for overriding/complementing system mime type mappings
	customMimeMappings = map[string]string{

		// keys *must* be lower-case

		".log": "text/plain",
	}
)

// PayloadArtifacts returns the artifacts as listed in the payload of the task (note this does
// not include log files)
func (task *TaskRun) PayloadArtifacts() []artifacts.TaskArtifact {
	payloadArtifacts := make([]artifacts.TaskArtifact, 0)
	for _, artifact := range task.Payload.Artifacts {
		basePath := artifact.Path
		base := &artifacts.BaseArtifact{
			Name:    artifact.Name,
			Expires: artifact.Expires,
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
			payloadArtifacts = append(payloadArtifacts, resolve(base, "file", basePath, artifact.ContentType, artifact.ContentEncoding))
		case "directory":
			if errArtifact := resolve(base, "directory", basePath, artifact.ContentType, artifact.ContentEncoding); errArtifact != nil {
				payloadArtifacts = append(payloadArtifacts, errArtifact)
				continue
			}
			walkFn := func(path string, info os.FileInfo, incomingErr error) error {
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
				b := &artifacts.BaseArtifact{
					Name:    canonicalPath(subName),
					Expires: base.Expires,
				}
				switch {
				// Issue 6488
				// Sometimes an error occurs during the scanning of a file or
				// directory. Perhaps this is when a file/directory is deleted
				// while the directory is being scanned, or perhaps it can
				// happen if Generic Worker does not have read permissions for
				// the file/directory. Either way, create an error artifact to
				// cause the task to fail, and the cause to be preserved in the
				// error artifact.
				case incomingErr != nil:
					fullPath := fileutil.AbsFrom(taskContext.TaskDir, subPath)
					payloadArtifacts = append(
						payloadArtifacts,
						&artifacts.ErrorArtifact{
							BaseArtifact: b,
							Message:      fmt.Sprintf("Error processing file '%s' as artifact: %s", fullPath, incomingErr),
							Reason:       "invalid-resource-on-worker",
							Path:         subPath,
						},
					)
				case info.IsDir():
					if errArtifact := resolve(b, "directory", subPath, artifact.ContentType, artifact.ContentEncoding); errArtifact != nil {
						payloadArtifacts = append(payloadArtifacts, errArtifact)
					}
				default:
					payloadArtifacts = append(payloadArtifacts, resolve(b, "file", subPath, artifact.ContentType, artifact.ContentEncoding))
				}
				return nil
			}
			// Any error returned here should already have been handled by
			// walkFn, so should be safe to ignore.
			_ = filepath.Walk(fileutil.AbsFrom(taskContext.TaskDir, basePath), walkFn)
		}
	}
	return payloadArtifacts
}

// File should be resolved as an S3Artifact if file exists as file and is
// readable, otherwise i) if it does not exist as a "file-missing-on-worker" ErrorArtifact,
// or ii) if it cannot be read by the task user, as a "file-not-readable-on-worker" ErrorArtifact,
// otherwise if it exists as a directory, as an "invalid-resource-on-worker" ErrorArtifact.
// A directory should resolve as `nil` if directory exists as directory and is readable,
// otherwise i) if it does not exist or ii) cannot be read, as a "file-missing-on-worker"
// ErrorArtifact, otherwise if it exists as a file, as
// "invalid-resource-on-worker" ErrorArtifact
// TODO: need to also handle "too-large-file-on-worker"
func resolve(base *artifacts.BaseArtifact, artifactType string, path string, contentType string, contentEncoding string) artifacts.TaskArtifact {
	fullPath := fileutil.AbsFrom(taskContext.TaskDir, path)
	fileReader, err := os.Open(fullPath)
	if err != nil {
		// cannot read file/dir, create an error artifact
		return &artifacts.ErrorArtifact{
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
		return &artifacts.ErrorArtifact{
			BaseArtifact: base,
			Message:      fmt.Sprintf("Could not stat %s '%s'", artifactType, fullPath),
			Reason:       "invalid-resource-on-worker",
			Path:         path,
		}
	}
	if artifactType == "file" && fileinfo.IsDir() {
		return &artifacts.ErrorArtifact{
			BaseArtifact: base,
			Message:      fmt.Sprintf("File artifact '%s' exists as a directory, not a file, on the worker", fullPath),
			Reason:       "invalid-resource-on-worker",
			Path:         path,
		}
	}
	if artifactType == "directory" && !fileinfo.IsDir() {
		return &artifacts.ErrorArtifact{
			BaseArtifact: base,
			Message:      fmt.Sprintf("Directory artifact '%s' exists as a file, not a directory, on the worker", fullPath),
			Reason:       "invalid-resource-on-worker",
			Path:         path,
		}
	}
	if artifactType == "directory" {
		return nil
	}

	tempPath, err := copyToTempFileAsTaskUser(fullPath)
	if err != nil {
		return &artifacts.ErrorArtifact{
			BaseArtifact: base,
			Message:      fmt.Sprintf("Could not copy file '%s' to temporary location as task user: %v", fullPath, err),
			Reason:       "file-not-readable-on-worker",
			Path:         path,
		}
	}

	// Is content type specified in task payload?
	if contentType == "" {
		extension := filepath.Ext(path)
		// first look up our own custom mime type mappings
		contentType = customMimeMappings[strings.ToLower(extension)]
		// then fall back to system mime type mappings
		if contentType == "" {
			contentType = mime.TypeByExtension(extension)
		}
		// lastly, fall back to application/octet-stream in the absense of any other value
		if contentType == "" {
			// application/octet-stream is the mime type for "unknown"
			contentType = "application/octet-stream"
		}
	}
	// Is content encoding specified in task payload?
	if contentEncoding == "" {
		extension := filepath.Ext(path)
		// originally based on https://github.com/evansd/whitenoise/blob/03f6ea846394e01cbfe0c730141b81eb8dd6e88a/whitenoise/compress.py#L21-L29
		SkipCompressionExtensions := map[string]bool{
			".7z":    true,
			".bz2":   true,
			".deb":   true,
			".dmg":   true,
			".flv":   true,
			".gif":   true,
			".gz":    true,
			".jpeg":  true,
			".jpg":   true,
			".png":   true,
			".swf":   true,
			".tbz":   true,
			".tgz":   true,
			".webp":  true,
			".whl":   true, // Python wheel are already zip file
			".woff":  true,
			".woff2": true,
			".xz":    true,
			".zip":   true,
			".zst":   true,
		}
		// When the file extension is blacklisted in SkipCompressionExtensions then "identity" should be used, otherwise "gzip".
		if SkipCompressionExtensions[extension] {
			contentEncoding = "identity"
		} else {
			contentEncoding = "gzip"
		}
	}
	return createDataArtifact(base, fullPath, tempPath, contentType, contentEncoding)
}

// The Queue expects paths to use a forward slash, so let's make sure we have a
// way to generate a path in this format
func canonicalPath(path string) string {
	if os.PathSeparator == '/' {
		return path
	}
	return strings.Replace(path, string(os.PathSeparator), "/", -1)
}

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
	task.Artifacts[artifact.Base().Name] = artifact
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
						"There was a conflict uploading artifact %v - this suggests artifact %v was already uploaded to this task with different content earlier on in this task.\n"+
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

func copyToTempFileAsTaskUser(filePath string) (tempFilePath string, err error) {
	cmd, err := gwCopyToTempFile(filePath)
	if err != nil {
		return "", fmt.Errorf("Failed to create new command to copy file %s to temporary location as task user: %v", filePath, err)
	}

	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("Failed to copy file %s to temporary location as task user: %v", filePath, err)
	}

	tempFilePath = strings.TrimSpace(string(output))

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
