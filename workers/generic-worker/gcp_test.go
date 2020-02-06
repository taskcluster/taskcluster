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
		t.Fatalf("Was expecting machine id %q but got %q", expected, actual)
	}
	expectedClientID := "test-client-id"
	actualClientID := config.ClientID
	if actualClientID != expectedClientID {
		t.Fatalf("Was expecting client id %q but got %q", expectedClientID, actualClientID)
	}
	expectedWorkerLocation := `{"cloud":"google","region":"in-central1","zone":"in-central1-b"}`
	actualWorkerLocation := config.WorkerLocation
	if actualWorkerLocation != expectedWorkerLocation {
		t.Fatalf("Was expecting worker location %q but got %q", expectedWorkerLocation, actualWorkerLocation)
	}
}
