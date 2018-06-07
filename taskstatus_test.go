package main

import (
	"testing"
)

// Makes sure that if a running task gets cancelled externally, the worker does not shut down
func TestResolveResolvedTask(t *testing.T) {
	defer setup(t)()
	td, payload := cancelTask(t)
	_ = submitAndAssert(t, td, payload, "exception", "canceled")
}
