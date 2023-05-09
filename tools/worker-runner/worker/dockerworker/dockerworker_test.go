//go:build linux

package dockerworker

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/Flaque/filet"
	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/run"
)

func TestStartWorkerJSFile(t *testing.T) {
	defer filet.CleanUp(t)
	dir := filet.TmpDir(t, "")

	// this test requires `node` be in the path (part of the reason for
	// introducing the docker-worker tarball format), so if that is not
	// available then skip the test.
	_, err := exec.LookPath("node")
	if err != nil {
		t.Skip("'node' is not the path")
	}

	// set up dir/repo/src/bin/worker.js to be a short node program that
	// just exits successfully
	binDir := filepath.Join(dir, "repo", "src", "bin")
	require.NoError(t, os.MkdirAll(binDir, 0755))
	workerJs := filepath.Join(binDir, "worker.js")
	require.NoError(t, os.WriteFile(workerJs, []byte("process.exit(0)"), 0644))

	dw := dockerworker{
		wicfg: dockerworkerConfig{
			Path:       filepath.Join(dir, "repo"),
			ConfigPath: filepath.Join(dir, "config.json"),
		},
	}
	state := run.State{
		// lots of omitted fields that aren't used
		WorkerConfig: cfg.NewWorkerConfig(),
	}
	_, err = dw.StartWorker(&state)
	require.NoError(t, err)

	require.NoError(t, dw.Wait())
}

func TestStartWorkerReleaseTarball(t *testing.T) {
	defer filet.CleanUp(t)
	dir := filet.TmpDir(t, "")

	// set up dir/repo/src/bin/worker.js to be a short node program that
	// just exits successfully
	binDir := filepath.Join(dir, "docker-worker", "bin")
	require.NoError(t, os.MkdirAll(binDir, 0755))
	workerScript := filepath.Join(binDir, "docker-worker")
	require.NoError(t, os.WriteFile(workerScript, []byte(`#!/bin/sh
		bail() { echo "fake docker-worker: $1" >&2; exit 1; }
		[ "$#" = "3" ] || bail "wrong number of args ($#)"
		[ "$1" = "--host" ] || bail "no --host"
		[ "$2" = "worker-runner" ] || bail "no worker-runner"
		[ "$3" = "production" ] || bail "no prodcution"
	`), 0755))

	dw := dockerworker{
		wicfg: dockerworkerConfig{
			Path:       filepath.Join(dir, "docker-worker"),
			ConfigPath: filepath.Join(dir, "config.json"),
		},
	}
	state := run.State{
		// lots of omitted fields that aren't used
		WorkerConfig: cfg.NewWorkerConfig(),
	}
	_, err := dw.StartWorker(&state)
	require.NoError(t, err)

	require.NoError(t, dw.Wait())
}
