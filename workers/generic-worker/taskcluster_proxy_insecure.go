//go:build insecure

package main

// proxyAllowedUser returns "" since the insecure engine has no separate task
// user, so the task's taskcluster-proxy does not verify connecting users.
func proxyAllowedUser(_ *TaskRun) (string, error) {
	return "", nil
}
