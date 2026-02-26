package main

import (
	"fmt"
	"path/filepath"
	"sync"

	"github.com/taskcluster/taskcluster/v96/internal/scopes"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/fileutil"
)

var (
	// metadataMutex protects access to the generic-worker-metadata.json file
	// for concurrent task execution (capacity > 1)
	metadataMutex sync.Mutex

	metadataFilename = filepath.Join(cwd, "generic-worker-metadata.json")
)

type (
	MetadataFeature struct {
	}

	MetadataTaskFeature struct {
		task *TaskRun
		info *MetadataInfo
	}

	MetadataInfo struct {
		LastTaskURL string `json:"lastTaskUrl"`
	}
)

func (mf *MetadataFeature) Name() string {
	return "Metadata"
}

func (mf *MetadataFeature) Initialise() error {
	return nil
}

func (mf *MetadataFeature) IsEnabled() bool {
	return config.EnableMetadata
}

func (mf *MetadataFeature) IsRequested(task *TaskRun) bool {
	return true
}

func (mf *MetadataFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &MetadataTaskFeature{
		task: task,
	}
}

func (mtf *MetadataTaskFeature) ReservedArtifacts() []string {
	return []string{}
}

func (mtf *MetadataTaskFeature) RequiredScopes() scopes.Required {
	return scopes.Required{}
}

func (mtf *MetadataTaskFeature) Start() *CommandExecutionError {
	return nil
}

func (mtf *MetadataTaskFeature) Stop(err *ExecutionErrors) {
	mtf.info = &MetadataInfo{
		LastTaskURL: fmt.Sprintf("%v/tasks/%v/runs/%v", config.RootURL, mtf.task.TaskID, mtf.task.RunID),
	}

	metadataMutex.Lock()
	e := fileutil.WriteToFileAsJSON(mtf.info, metadataFilename)
	metadataMutex.Unlock()
	// if we can't write this, something seriously wrong, so cause worker to
	// report an internal-error to sentry and crash!
	if e != nil {
		panic(err)
	}
}
