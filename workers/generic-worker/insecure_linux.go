//go:build insecure && linux

package main

import gwruntime "github.com/taskcluster/taskcluster/v64/workers/generic-worker/runtime"

func makeFileOrDirReadWritableForUser(recurse bool, fileOrDir string, user *gwruntime.OSUser) error {
	return nil
}

func makeDirUnreadableForUser(dir string, user *gwruntime.OSUser) error {
	return nil
}