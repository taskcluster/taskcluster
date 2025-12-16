package main

import (
	"fmt"
	"mime"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/taskcluster/taskcluster/v95/internal/scopes"
	"github.com/taskcluster/taskcluster/v95/workers/generic-worker/artifacts"
	"github.com/taskcluster/taskcluster/v95/workers/generic-worker/process"
	"golang.org/x/sync/errgroup"
)

type (
	ArtifactFeature struct {
	}

	ArtifactTaskFeature struct {
		task            *TaskRun
		startSuccessful bool
		artifacts       []artifacts.TaskArtifact
	}
)

func (af *ArtifactFeature) Name() string {
	return "Artifact Uploads"
}

func (af *ArtifactFeature) Initialise() (err error) {
	return nil
}

func (af *ArtifactFeature) IsEnabled() bool {
	return true
}

func (af *ArtifactFeature) IsRequested(task *TaskRun) bool {
	return len(task.Payload.Artifacts) > 0
}

func (af *ArtifactFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &ArtifactTaskFeature{
		task: task,
	}
}

func (atf *ArtifactTaskFeature) ReservedArtifacts() []string {
	return []string{}
}

func (atf *ArtifactTaskFeature) RequiredScopes() scopes.Required {
	return scopes.Required{}
}

func (atf *ArtifactTaskFeature) Start() *CommandExecutionError {
	for _, artifact := range atf.task.Payload.Artifacts {
		// The default artifact expiry is task expiry, but is only applied when
		// the task artifacts are resolved. We intentionally don't modify
		// task.Payload otherwise it no longer reflects the real data defined
		// in the task.
		if !time.Time(artifact.Expires).IsZero() {
			// Don't be too strict: allow 1s discrepancy to account for
			// possible timestamp rounding on upstream systems
			if time.Time(artifact.Expires).Add(time.Second).Before(time.Time(atf.task.Definition.Deadline)) {
				return MalformedPayloadError(fmt.Errorf("malformed payload: artifact '%v' expires before task deadline (%v is before %v)", artifact.Path, artifact.Expires, atf.task.Definition.Deadline))
			}
			// Don't be too strict: allow 1s discrepancy to account for
			// possible timestamp rounding on upstream systems
			if time.Time(artifact.Expires).After(time.Time(atf.task.Definition.Expires).Add(time.Second)) {
				return MalformedPayloadError(fmt.Errorf("malformed payload: artifact '%v' expires after task expiry (%v is after %v)", artifact.Path, artifact.Expires, atf.task.Definition.Expires))
			}
		}
	}
	atf.startSuccessful = true
	return nil
}

func (atf *ArtifactTaskFeature) Stop(err *ExecutionErrors) {
	if !atf.startSuccessful {
		return
	}

	task := atf.task
	atf.FindArtifacts()
	taskArtifacts := atf.artifacts

	// Use errgroup to limit concurrent uploads to 10
	// to hopefully avoid issues like the following:
	// https://github.com/taskcluster/taskcluster/issues/8023
	group := &errgroup.Group{}
	group.SetLimit(10)

	uploadErrChan := make(chan *CommandExecutionError, len(taskArtifacts))
	failChan := make(chan *CommandExecutionError, len(taskArtifacts))

	for _, taskArtifact := range taskArtifacts {
		group.Go(func() error {
			// Any attempt to upload a feature artifact should be skipped
			// but not cause a failure, since e.g. a directory artifact
			// could include one, non-maliciously, such as a top level
			// public/ directory artifact that includes
			// public/logs/live_backing.log inadvertently.
			if feature := task.featureArtifacts[taskArtifact.Base().Name]; feature != "" {
				task.Warnf("Not uploading artifact %v found in task.payload.artifacts section, since this will be uploaded later by %v", taskArtifact.Base().Name, feature)
				return nil
			}
			e := task.uploadArtifact(taskArtifact)
			if e != nil {
				// we don't care about optional artifacts failing to upload
				if taskArtifact.Base().Optional {
					return nil
				}
				uploadErrChan <- e
			}
			// Note - the above error only covers not being able to upload an
			// artifact, but doesn't cover case that an artifact could not be
			// found, and so an error artifact was uploaded. So we do that
			// here:
			switch a := taskArtifact.(type) {
			case *artifacts.ErrorArtifact:
				// we don't care about optional artifacts failing to upload
				if a.Optional {
					return nil
				}
				fail := Failure(fmt.Errorf("%v: %v", a.Reason, a.Message))
				failChan <- fail
				task.Errorf("TASK FAILURE during artifact upload: %v", fail)
			}
			return nil
		})
	}

	// errors are handled via channels so we can collect all of them
	_ = group.Wait()
	close(uploadErrChan)
	close(failChan)

	for executionErr := range uploadErrChan {
		err.add(executionErr)
	}
	for executionErr := range failChan {
		err.add(executionErr)
	}
}

// FindArtifacts scans the file system for the file/directory artifacts listed
// in the payload of the task (note this does not include log files) and
// updates its internal record of what files exist.
// The artifacts will be stored in the ArtifactTaskFeature struct, and will
// be sorted by their String() method.
func (atf *ArtifactTaskFeature) FindArtifacts() {
	task := atf.task
	var wg sync.WaitGroup
	artifactsChan := make(chan []artifacts.TaskArtifact, len(task.Payload.Artifacts))

	processArtifact := func(artifact Artifact) {
		defer wg.Done()
		payloadArtifacts := make([]artifacts.TaskArtifact, 0)

		basePath := artifact.Path
		base := &artifacts.BaseArtifact{
			Name:     artifact.Name,
			Expires:  artifact.Expires,
			Optional: artifact.Optional,
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
			payloadArtifacts = append(payloadArtifacts, resolve(base, "file", basePath, artifact.ContentType, artifact.ContentEncoding, task.pd))
		case "directory":
			if errArtifact := resolve(base, "directory", basePath, artifact.ContentType, artifact.ContentEncoding, task.pd); errArtifact != nil {
				payloadArtifacts = append(payloadArtifacts, errArtifact)
				break
			}
			walkFn := func(path string, d os.DirEntry, incomingErr error) error {
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
					Name:     canonicalPath(subName),
					Expires:  base.Expires,
					Optional: base.Optional,
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
					fullPath := filepath.Join(taskContext.TaskDir, subPath)
					payloadArtifacts = append(
						payloadArtifacts,
						&artifacts.ErrorArtifact{
							BaseArtifact: b,
							Message:      fmt.Sprintf("Error processing file '%s' as artifact: %s", fullPath, incomingErr),
							Reason:       "invalid-resource-on-worker",
							Path:         subPath,
						},
					)
				case d.IsDir():
					if errArtifact := resolve(b, "directory", subPath, artifact.ContentType, artifact.ContentEncoding, task.pd); errArtifact != nil {
						payloadArtifacts = append(payloadArtifacts, errArtifact)
					}
				default:
					payloadArtifacts = append(payloadArtifacts, resolve(b, "file", subPath, artifact.ContentType, artifact.ContentEncoding, task.pd))
				}
				return nil
			}
			// Any error returned here should already have been handled by
			// walkFn, so should be safe to ignore.
			_ = filepath.WalkDir(filepath.Join(taskContext.TaskDir, basePath), walkFn)
		}
		artifactsChan <- payloadArtifacts
	}

	for _, artifact := range task.Payload.Artifacts {
		wg.Add(1)
		go processArtifact(artifact)
	}

	go func() {
		wg.Wait()
		close(artifactsChan)
	}()

	payloadArtifacts := make([]artifacts.TaskArtifact, 0)
	for artifacts := range artifactsChan {
		payloadArtifacts = append(payloadArtifacts, artifacts...)
	}

	// sort so that the order of the artifacts is deterministic
	slices.SortFunc(payloadArtifacts, func(a, b artifacts.TaskArtifact) int {
		return strings.Compare(a.String(), b.String())
	})

	atf.artifacts = payloadArtifacts
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
func resolve(base *artifacts.BaseArtifact, artifactType, path, contentType, contentEncoding string, pd *process.PlatformData) artifacts.TaskArtifact {
	fullPath := filepath.Join(taskContext.TaskDir, path)
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

	tempPath, err := copyToTempFileAsTaskUser(fullPath, pd)
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
			".npz":   true,
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
	return strings.ReplaceAll(path, string(os.PathSeparator), "/")
}
