package main

import (
	"fmt"
	"testing"
	"time"

	"github.com/taskcluster/taskcluster-client-go/queue"
)

func TestDirectoryArtifact(t *testing.T) {
	expiry := queue.Time(time.Now().Add(time.Minute * 1))
	tr := &TaskRun{
		Payload: GenericWorkerPayload{
			Artifacts: []struct {
				Expires queue.Time `json:"expires"`
				Path    string     `json:"path"`
				Type    string     `json:"type"`
			}{{
				Expires: expiry,
				Path:    "test/TestDirectoryArtifact",
				Type:    "directory",
			}},
		},
	}

	artifacts := tr.PayloadArtifacts()
	expectedArtifacts := []Artifact{
		S3Artifact{
			BaseArtifact: BaseArtifact{
				CanonicalPath: "test/TestDirectoryArtifact/%%%/v/X",
				Expires:       expiry,
			},
			MimeType: "application/octet-stream",
		},
		S3Artifact{
			BaseArtifact: BaseArtifact{
				CanonicalPath: "test/TestDirectoryArtifact/_/X.exe",
				Expires:       expiry,
			},
			MimeType: "application/x-msdownload",
		},
		S3Artifact{
			BaseArtifact: BaseArtifact{
				CanonicalPath: "test/TestDirectoryArtifact/b/c/d.jpg",
				Expires:       expiry,
			},
			MimeType: "image/jpeg",
		},
	}

	// compare by converting objects to strings...
	if fmt.Sprintf("%q", artifacts) != fmt.Sprintf("%q", expectedArtifacts) {
		t.Fatalf("Expected different artifacts to be generated from directory artifact 'test/TestDirectoryArtifact'...\nExpected:\n%q\nActual:\n%q", expectedArtifacts, artifacts)
	}
}
