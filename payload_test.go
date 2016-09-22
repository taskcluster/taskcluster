package main

import (
	"runtime"
	"testing"

	"github.com/xeipuuv/gojsonschema"
)

// Test that the burned in payload schema is a valid json schema
func TestPayloadSchemaValid(t *testing.T) {
	payloadSchema := taskPayloadSchema()
	schemaLoader := gojsonschema.NewStringLoader(payloadSchema)
	_, err := gojsonschema.NewSchema(schemaLoader)
	if err != nil {
		t.Logf("Generic Worker payload schema is not a valid json schema for platform %v.", runtime.GOOS)
		t.Log("Payload schema:")
		t.Log(payloadSchema)
		t.Log("Error:")
		t.Fatalf("%s", err)
	}
}
