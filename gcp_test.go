package main

import (
	"testing"
)

func TestGcpWorkerTypeMetadata(t *testing.T) {
	m := &MockGCPProvisionedEnvironment{}
	defer m.Setup(t)()
	md := config.WorkerTypeMetadata
	gcp := md["gcp"].(map[string]interface{})
	actual := gcp["id"].(string)
	expected := "some-id"
	if actual != expected {
		t.Fatalf("Was expecting machine id '%v' but got '%v'", expected, actual)
	}
}
