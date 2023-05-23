//go:build simple

package main

import "testing"

func grantingDenying(t *testing.T, filetype string, taskPath ...string) (granting, denying []string) {
	t.Helper()
	return []string{}, []string{}
}
