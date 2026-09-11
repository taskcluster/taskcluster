//go:build multiuser

package main

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"strings"

	"github.com/taskcluster/taskcluster/v109/workers/generic-worker/artifacts"
	"github.com/taskcluster/taskcluster/v109/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v109/workers/generic-worker/runtime"
)

type taskUserFile struct {
	path    string
	pd      *process.PlatformData
	taskDir string
}

func taskUserContentSource(filePath string, pd *process.PlatformData, taskDir string) artifacts.ContentSource {
	return taskUserFile{path: filePath, pd: pd, taskDir: taskDir}
}

func (f taskUserFile) WriteContent(w io.Writer) (int64, error) {
	return catFileAsTaskUser(f.path, w, f.pd, f.taskDir)
}

func catFileAsTaskUser(filePath string, dest io.Writer, pd *process.PlatformData, taskDir string) (int64, error) {
	cmd, err := process.NewCommandNoOutputStreams([]string{gwruntime.GenericWorkerBinary(), "cat-file", "--cat-file", filePath}, taskDir, []string{}, pd)
	if err != nil {
		return 0, fmt.Errorf("failed to create new command to read file %s as task user: %v", filePath, err)
	}

	var stderr bytes.Buffer
	out := &recordingWriter{Writer: dest}
	cmd.Stdout = out
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		if out.err != nil {
			return out.written, out.err
		}
		readErr := fmt.Errorf("failed to read file %s as task user: %v: %s", filePath, err, strings.TrimSpace(stderr.String()))

		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) && exitErr.ExitCode() == int(CANT_CAT_FILE) {
			return out.written, artifacts.ContentError{Err: readErr}
		}
		return out.written, readErr
	}
	return out.written, nil
}

type recordingWriter struct {
	io.Writer
	written int64
	err     error
}

func (w *recordingWriter) Write(p []byte) (int, error) {
	n, err := w.Writer.Write(p)
	w.written += int64(n)
	if err != nil {
		w.err = err
	}
	return n, err
}
