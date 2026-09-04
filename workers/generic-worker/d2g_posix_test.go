//go:build darwin || linux || freebsd

package main

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/taskcluster/taskcluster/v108/tools/d2g/dockerworker"
)

// TestDockerWorkerSchemaMatchesD2G verifies that this engine's embedded
// "Docker Worker payload" branch (in schemas/insecure_posix.yml or
// schemas/multiuser_posix.yml, depending on build tag) stays content-identical
// to the canonical source at tools/d2g/schemas/docker-worker/v1/payload.yml.
// These are independently hand-maintained YAML files describing the same
// payload shape, and nothing in the build automatically keeps them in sync.
// If this test fails, update whichever side is wrong so they match again.
//
// This file is posix-only because schemas/multiuser_windows.yml has no such
// branch at all: Windows generic-worker does not support translating Docker
// Worker payloads via d2g, so there is nothing to compare there.
func TestDockerWorkerSchemaMatchesD2G(t *testing.T) {
	var local map[string]any
	if err := json.Unmarshal([]byte(JSONSchema()), &local); err != nil {
		t.Fatalf("Could not parse local JSONSchema(): %v", err)
	}
	var canonical map[string]any
	if err := json.Unmarshal([]byte(dockerworker.JSONSchema()), &canonical); err != nil {
		t.Fatalf("Could not parse dockerworker.JSONSchema(): %v", err)
	}

	oneOf, ok := local["oneOf"].([]any)
	if !ok {
		t.Fatal("Local schema has no top-level oneOf")
	}
	var dockerBranch map[string]any
	for _, item := range oneOf {
		if m, ok := item.(map[string]any); ok && m["title"] == "Docker Worker payload" {
			dockerBranch = m
			break
		}
	}
	if dockerBranch == nil {
		t.Fatal("Could not find a 'Docker Worker payload' branch in the local schema's oneOf")
	}

	// the embedded branch resolves "#/definitions/artifact" against the whole
	// file's shared top-level `definitions` (which also holds unrelated
	// definitions used only by the native Generic Worker payload branch,
	// e.g. `mount`); extract just the `artifact` definition it actually uses,
	// to compare against the canonical schema's own, self-contained copy.
	definitions, _ := local["definitions"].(map[string]any)
	artifactDef, _ := definitions["artifact"].(map[string]any)
	dockerBranch["definitions"] = map[string]any{"artifact": artifactDef}

	// the canonical schema is a standalone document, so it carries its own
	// $id/$schema that the embedded branch (nested within a larger document)
	// doesn't have.
	delete(canonical, "$id")
	delete(canonical, "$schema")

	if !reflect.DeepEqual(dockerBranch, canonical) {
		localJSON, _ := json.MarshalIndent(dockerBranch, "", "  ")
		canonicalJSON, _ := json.MarshalIndent(canonical, "", "  ")
		t.Errorf(
			"The embedded Docker Worker payload schema has drifted from tools/d2g/schemas/docker-worker/v1/payload.yml.\nEmbedded:\n%s\nCanonical:\n%s",
			localJSON, canonicalJSON,
		)
	}
}
