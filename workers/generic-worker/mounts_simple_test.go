//go:build simple

package main

import "testing"

func grantingDenying(t *testing.T, filetype string, cacheFile bool, taskPath ...string) (granting, denying []string) {
	t.Helper()
	return []string{}, []string{}
}
