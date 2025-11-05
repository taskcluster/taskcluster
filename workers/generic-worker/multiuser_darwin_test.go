//go:build multiuser

package main

import (
	"strings"
	"testing"

	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/taskcluster/v92/clients/client-go/tcqueue"
)

func TestDesktopIntegration(t *testing.T) {
	// We run the same test under both headless and non-headless mode, but
	// expect different results. So pull it out into its own function...
	f := func(t *testing.T, headless bool) (td *tcqueue.TaskDefinitionRequest, payload GenericWorkerPayload) {
		t.Helper()
		setup(t)
		config.HeadlessTasks = headless
		payload = GenericWorkerPayload{
			Command: [][]string{
				{
					"/bin/bash",
					"-c",
					strings.Join(
						[]string{
							"echo 'hello' | pbcopy",
							"pbpaste | grep 'hello'",
						},
						"\n",
					),
				},
			},
			MaxRunTime: 10,
		}
		defaults.SetDefaults(&payload)
		td = testTask(t)
		return
	}

	// Not headless test - test should pass as pasteboard access requires desktop integration
	td, payload := f(t, false)
	_ = submitAndAssert(t, td, payload, "completed", "completed")

	// Headless test - test should fail as headless environment has no desktop and thus no pasteboard access
	td, payload = f(t, true)
	_ = submitAndAssert(t, td, payload, "failed", "failed")
}
