package main

import (
	"strings"
	"testing"

	"github.com/mcuadros/go-defaults"
)

// Test failure should resolve as "failed"
func TestDesktopIntegration(t *testing.T) {
	setup(t)
	payload := GenericWorkerPayload{
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
	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "completed", "completed")
}
