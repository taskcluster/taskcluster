//go:build insecure

package main

import (
	"io"
	"os"

	"github.com/taskcluster/taskcluster/v108/workers/generic-worker/artifacts"
	"github.com/taskcluster/taskcluster/v108/workers/generic-worker/fileutil"
	"github.com/taskcluster/taskcluster/v108/workers/generic-worker/process"
)

type taskUserFile string

func taskUserContentSource(filePath string, _ *process.PlatformData, _ string) artifacts.ContentSource {
	return taskUserFile(filePath)
}

func (f taskUserFile) OpenForUpload() (*os.File, error) {
	file, err := fileutil.OpenRegularFile(string(f))
	if err != nil {
		return nil, artifacts.ContentError{Err: err}
	}
	return file, nil
}

func (f taskUserFile) WriteContent(w io.Writer) (int64, error) {
	source, err := f.OpenForUpload()
	if err != nil {
		return 0, err
	}
	defer source.Close()
	return io.Copy(w, source)
}
