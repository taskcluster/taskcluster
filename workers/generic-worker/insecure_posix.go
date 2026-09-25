//go:build insecure && (darwin || linux || freebsd)

package main

import (
	"os"

	"github.com/taskcluster/taskcluster/v110/workers/generic-worker/fileutil"
	"github.com/taskcluster/taskcluster/v110/workers/generic-worker/process"
)

func MkdirAllTaskUser(dir string, ctx *TaskContext, pd *process.PlatformData) error {
	return fileutil.CreateDir(ctx.TaskDir, dir)
}

func CreateFileAsTaskUser(file string, ctx *TaskContext, pd *process.PlatformData) (*os.File, error) {
	return fileutil.CreateFile(ctx.TaskDir, file)
}
