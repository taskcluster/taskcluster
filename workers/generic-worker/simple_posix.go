//go:build simple && (darwin || linux || freebsd)

package main

import (
	"os"

	gwruntime "github.com/taskcluster/taskcluster/v53/workers/generic-worker/runtime"
)

func MkdirAllTaskUser(dir string, perms os.FileMode) (err error) {
	return os.MkdirAll(dir, perms)
}

func makeFileOrDirReadWritableForUser(recurse bool, fileOrDir string, user *gwruntime.OSUser) error {
	return nil
}
