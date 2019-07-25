package main

import (
	"encoding/json"
	"fmt"
	"path/filepath"

	"github.com/taskcluster/generic-worker/fileutil"
	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/taskcluster-base-go/scopes"
)

var (
	supersededByPath = filepath.Join("generic-worker", "superseded-by.json")
	supersededByName = "public/superseded-by.json"
)

type SupersedeFeature struct {
}

type SupersedesServiceResponse struct {
	TaskIDs []string `json:"supersedes"`
}

func (feature *SupersedeFeature) Name() string {
	return "Supersede"
}

func (feature *SupersedeFeature) Initialise() error {
	return nil
}

func (feature *SupersedeFeature) PersistState() error {
	return nil
}

// Supersede is always enabled
func (feature *SupersedeFeature) IsEnabled(task *TaskRun) bool {
	return true
}

type SupersedeTask struct {
	task *TaskRun
}

func (l *SupersedeTask) ReservedArtifacts() []string {
	return []string{
		supersededByName,
	}
}

func (feature *SupersedeFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &SupersedeTask{
		task: task,
	}
}

func (l *SupersedeTask) RequiredScopes() scopes.Required {
	// let's not require any scopes, as I see no reason to control access to this feature
	return scopes.Required{}
}

func (l *SupersedeTask) Start() *CommandExecutionError {
	supersederURL := l.task.Payload.SupersederURL
	if supersederURL == "" {
		return nil
	}
	resp, _, err := httpbackoff.Get(supersederURL)
	if err != nil {
		// if problem with superseder service, let's run all tasks, and not resolve them all as exception
		l.task.Warnf("[supersede] Problem accessing supersederUrl: %v", err)
		l.task.Warn("[supersede] Not able to see if this task has been superseded!")
		return nil
	}
	decoder := json.NewDecoder(resp.Body)
	var supersedes SupersedesServiceResponse
	err = decoder.Decode(&supersedes)
	if err != nil {
		// if problem with superseder service, let's run all tasks, and not resolve them all as exception
		l.task.Warnf("[supersede] Not able to interpret response from supersederUrl %v as json list of task IDs: %v", supersederURL, err)
		l.task.Warn("[supersede] Not able to see if this task has been superseded!")
		return nil
	}
	taskIDs := supersedes.TaskIDs
	if len(taskIDs) < 1 {
		return nil
	}
	if l.task.TaskID != taskIDs[0] {
		supersededByFile := filepath.Join(taskContext.TaskDir, supersededByPath)
		err = fileutil.WriteToFileAsJSON(
			map[string]string{
				"taskId": taskIDs[0],
			},
			supersededByFile,
		)
		if err != nil {
			panic(err)
		}
		e := l.task.uploadArtifact(
			&S3Artifact{
				BaseArtifact: &BaseArtifact{
					Name:    supersededByName,
					Expires: l.task.Definition.Expires,
				},
				Path:            supersededByPath,
				ContentEncoding: "gzip",
				ContentType:     "application/json",
			},
		)
		if e != nil {
			panic(e)
		}
		return &CommandExecutionError{
			TaskStatus: aborted,
			Cause:      fmt.Errorf("Task %v has been superseded by task %v", l.task.TaskID, taskIDs[0]),
			Reason:     superseded,
		}
	}
	return nil
}

func (l *SupersedeTask) Stop(*ExecutionErrors) {
}
