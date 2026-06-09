package main

import (
	"io"
	"os"

	"github.com/taskcluster/taskcluster/v100/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v100/workers/generic-worker/runtime"
)

// gwVersion returns a command that will run the
// `generic-worker --version` command as the task user.
// This is used during the startup of the worker to
// ensure that the generic-worker binary is readable/executable
// by the task user.
func gwVersion(pd *process.PlatformData, taskDir string) (*process.Command, error) {
	return process.NewCommand([]string{gwruntime.GenericWorkerBinary(), "--version"}, taskDir, []string{}, pd)
}

func copyFileContents(src, dst string) (err error) {
	in, err := os.Open(src)
	if err != nil {
		return
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return
	}
	defer func() {
		cerr := out.Close()
		if err == nil {
			err = cerr
		}
	}()
	if _, err = io.Copy(out, in); err != nil {
		return
	}
	err = out.Sync()
	return
}
