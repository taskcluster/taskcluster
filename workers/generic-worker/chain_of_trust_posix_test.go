//go:build multiuser && (darwin || linux || freebsd)

package main

import (
	"syscall"
	"testing"

	"github.com/taskcluster/taskcluster/v114/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v114/workers/generic-worker/runtime"
)

// The command that checks the task user can't read the private chain of trust
// key must not inherit the task payload env or the worker's stdout/stderr.
func TestCatCotKeyCommandIsolatedFromTask(t *testing.T) {
	setup(t)
	task := &TaskRun{
		TaskID: "KTBKfEgxR5GdfIIREQIvFQ",
		Context: &TaskContext{
			TaskDir: t.TempDir(),
			User:    &gwruntime.OSUser{Name: "task_ktbkfegxr5gdf_0"},
		},
		pd: &process.PlatformData{
			SysProcAttr: &syscall.SysProcAttr{
				Credential: &syscall.Credential{Uid: 1001, Gid: 1001},
			},
		},
	}
	task.Payload.Env = map[string]string{
		"GW_TEST_ENV_VAR": "foo",
	}
	cot := &ChainOfTrustTaskFeature{task: task}

	c, err := cot.catCotKeyCommand()
	if err != nil {
		t.Fatalf("Could not create command: %v", err)
	}
	if c.Env == nil {
		t.Error("Command env is nil, so it would inherit the worker's environment")
	}
	if len(c.Env) != 0 {
		t.Errorf("Command env should be empty, but is %q", c.Env)
	}
	if c.Stdout != nil {
		t.Errorf("Command stdout should be nil, but is %v", c.Stdout)
	}
	if c.Stderr != nil {
		t.Errorf("Command stderr should be nil, but is %v", c.Stderr)
	}
}
