package main

import (
	"fmt"
	"sync"

	"github.com/taskcluster/taskcluster/v83/internal/scopes"
	"github.com/taskcluster/taskcluster/v83/workers/generic-worker/artifacts"
)

type (
	ArtifactFeature struct {
	}

	ArtifactTaskFeature struct {
		task *TaskRun
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
	return nil
}

func (atf *ArtifactTaskFeature) Stop(err *ExecutionErrors) {
	task := atf.task
	taskArtifacts := task.PayloadArtifacts()
	var wg sync.WaitGroup
	uploadErrChan := make(chan *CommandExecutionError, len(taskArtifacts))
	failChan := make(chan *CommandExecutionError, len(taskArtifacts))
	for _, artifact := range taskArtifacts {
		wg.Add(1)
		go func(artifact artifacts.TaskArtifact) {
			defer wg.Done()

			// Any attempt to upload a feature artifact should be skipped
			// but not cause a failure, since e.g. a directory artifact
			// could include one, non-maliciously, such as a top level
			// public/ directory artifact that includes
			// public/logs/live_backing.log inadvertently.
			if feature := task.featureArtifacts[artifact.Base().Name]; feature != "" {
				task.Warnf("Not uploading artifact %v found in task.payload.artifacts section, since this will be uploaded later by %v", artifact.Base().Name, feature)
				return
			}
			err := task.uploadArtifact(artifact)
			if err != nil {
				// we don't care about optional artifacts failing to upload
				if artifact.Base().Optional {
					return
				}
				uploadErrChan <- err
			}
			// Note - the above error only covers not being able to upload an
			// artifact, but doesn't cover case that an artifact could not be
			// found, and so an error artifact was uploaded. So we do that
			// here:
			switch a := artifact.(type) {
			case *artifacts.ErrorArtifact:
				// we don't care about optional artifacts failing to upload
				if a.Optional {
					return
				}
				fail := Failure(fmt.Errorf("%v: %v", a.Reason, a.Message))
				failChan <- fail
				task.Errorf("TASK FAILURE during artifact upload: %v", fail)
			}
		}(artifact)
	}

	wg.Wait()
	close(uploadErrChan)
	close(failChan)

	for executionErr := range uploadErrChan {
		err.add(executionErr)
	}
	for executionErr := range failChan {
		err.add(executionErr)
	}
}
