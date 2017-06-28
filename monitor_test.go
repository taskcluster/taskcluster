package main

import (
	"fmt"
	"os"
	"testing"

	"github.com/stretchr/testify/require"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/auth"
)

func TestMonitor(t *testing.T) {
	clientID := os.Getenv("TASKCLUSTER_CLIENT_ID")
	accessToken := os.Getenv("TASKCLUSTER_ACCESS_TOKEN")
	if clientID == "" || accessToken == "" {
		t.Skip("TASKCLUSTER_CLIENT_ID and TASKCLUSTER_ACCESS_TOKEN not defined")
	}
	a := auth.New(&tcclient.Credentials{
		ClientID:    clientID,
		AccessToken: accessToken,
	})

	m := NewMonitor("test-dummy-worker", a, "debug", nil)
	m.Debug("hello world")
	m.Measure("my-measure", 56)
	m.Count("my-counter", 1)
	m.WithPrefix("my-prefix").Count("counter-2", 1)
	m.WithPrefix("my-prefix").Info("info message")
	m.WithTag("myTag", "myValue").Warn("some warning")
	m.WithTag("myTag", "myValue").ReportWarning(fmt.Errorf("some test error message"), "this is a warning")

	incidentID := m.CapturePanic(func() {
		t.Log("No panicing happens here")
	})
	require.True(t, incidentID == "")

	incidentID = m.CapturePanic(func() {
		callingSomethingBad()
	})
	require.True(t, incidentID != "")
}

func badThingHappens() {
	panic("Oh, this is bad")
}

func callingSomethingBad() {
	badThingHappens()
}
