//go:build multiuser

package main

import (
	"os/user"
	"testing"

	gwruntime "github.com/taskcluster/taskcluster/v110/workers/generic-worker/runtime"
)

func TestProxyAllowedUser(t *testing.T) {
	current, err := user.Current()
	if err != nil {
		t.Fatalf("Could not determine current user: %v", err)
	}
	for _, tc := range []struct {
		name                 string
		runTaskAsCurrentUser bool
		want                 string
	}{
		{"task user", false, "task_1234"},
		{"run task as current user", true, current.Username},
	} {
		t.Run(tc.name, func(t *testing.T) {
			task := &TaskRun{
				Payload: GenericWorkerPayload{
					Features: FeatureFlags{
						RunTaskAsCurrentUser: tc.runTaskAsCurrentUser,
					},
				},
				Context: &TaskContext{
					User: &gwruntime.OSUser{Name: "task_1234"},
				},
			}
			got, err := proxyAllowedUser(task)
			if err != nil {
				t.Fatalf("proxyAllowedUser returned error: %v", err)
			}
			if got != tc.want {
				t.Fatalf("Expected proxy to admit %q, but got %q", tc.want, got)
			}
		})
	}
}

// TestTaskclusterProxyAsCurrentUser checks that a task whose commands run as
// the worker's own user can still reach its taskcluster-proxy, which only
// admits connections from the user the task's commands run as.
func TestTaskclusterProxyAsCurrentUser(t *testing.T) {
	setup(t)
	td := testTask(t)
	testTaskclusterProxy(t,
		FeatureFlags{RunTaskAsCurrentUser: true},
		"generic-worker:run-task-as-current-user:"+td.ProvisionerID+"/"+td.WorkerType,
	)
}
