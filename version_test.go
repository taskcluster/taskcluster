package main

import (
	"regexp"
	"testing"
)

func TestRevisionNumberStored(t *testing.T) {
	if !regexp.MustCompile("^[0-9a-f]{40}$").MatchString(revision) {
		t.Fatalf("Git revision could not be determined - got '%v' but expected to match regular expression '^[0-9a-f](40)$'\n"+
			"Did you specify `-ldflags \"-X github.com/taskcluster/taskcluster-proxy.revision=<GIT REVISION>\"` in your go test command?\n"+
			"Try running `./build.sh -t` in root directory of taskcluster-proxy source code.", revision)
	}
	t.Logf("Git revision successfully retrieved: %v", revision)
}
