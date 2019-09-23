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
	expectedClientID := "test-client-id"
	actualClientID := config.ClientID
	if actualClientID != expectedClientID {
		t.Fatalf("Was expecting client id '%v' but got '%v'", expectedClientID, actualClientID)
	}
}
