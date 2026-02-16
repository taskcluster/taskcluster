//go:build insecure && (darwin || linux || freebsd)

package main

import (
	"os"
)

func MkdirAllTaskUser(dir string, task *TaskRun) error {
	return os.MkdirAll(dir, 0700)
}

func CreateFileAsTaskUser(file string, task *TaskRun) (*os.File, error) {
	return os.Create(file)
}
