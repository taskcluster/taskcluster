package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/taskcluster/slugid-go/slugid"
)

type MockGCPProvisionedEnvironment struct {
}

func (m *MockGCPProvisionedEnvironment) Setup(t *testing.T) func() {
	teardown := setupEnvironment(t)
	workerType := slugid.Nice()
	configureForGCP = true
	oldGCPMetadataBaseURL := GCPMetadataBaseURL
	GCPMetadataBaseURL = "http://localhost:13243/computeMetadata/v1/"

	// Create custom *http.ServeMux rather than using http.DefaultServeMux, so
	// registered handler functions won't interfere with future tests that also
	// use http.DefaultServeMux.
	ec2MetadataHandler := http.NewServeMux()
	ec2MetadataHandler.HandleFunc("/", func(w http.ResponseWriter, req *http.Request) {
		switch req.URL.Path {

		// simulate gce provider concept endpoints

		case "/gce-thing/credentials":
			resp := map[string]interface{}{
				"clientId":    os.Getenv("TASKCLUSTER_CLIENT_ID"),
				"certificate": os.Getenv("TASKCLUSTER_CERTIFICATE"),
				"accessToken": os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
			}
			WriteJSON(t, w, resp)

		// simulate GCP endpoints

		case "/computeMetadata/v1/instance/attributes/config":
			resp := map[string]interface{}{
				"workerType":         workerType,
				"workerGroup":        "workers",
				"provisionerId":      "test-provisioner",
				"credentialUrl":      "http://localhost:13243/gce-thing/credentials",
				"audience":           "plants",
				"signingKeyLocation": filepath.Join(testdataDir, "private-opengpg-key"),
				"authBaseUrl":        "http://localhost:13243/auth",
				"queueBaseUrl":       "http://localhost:13243/queue",
			}
			WriteJSON(t, w, resp)
		case "/computeMetadata/v1/instance/service-accounts/default/identity":
			fmt.Fprintf(w, "sekrit-token")
		case "/computeMetadata/v1/instance/image":
			fmt.Fprintf(w, "fancy-generic-worker-image")
		case "/computeMetadata/v1/instance/id":
			fmt.Fprintf(w, "some-id")
		case "/computeMetadata/v1/instance/machine-type":
			fmt.Fprintf(w, "n1-standard")
		case "/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip":
			fmt.Fprintf(w, "1.2.3.4")
		case "/computeMetadata/v1/instance/zone":
			fmt.Fprintf(w, "us-west1")
		case "/computeMetadata/v1/instance/hostname":
			fmt.Fprintf(w, "1-2-3-4-at.google.com")
		case "/computeMetadata/v1/instance/network-interfaces/0/ip":
			fmt.Fprintf(w, "10.10.10.10")

		default:
			w.WriteHeader(400)
			fmt.Fprintf(w, "Cannot serve URL %v", req.URL)
			t.Fatalf("Cannot serve URL %v", req.URL)
		}
	})
	s := &http.Server{
		Addr:           "localhost:13243",
		Handler:        ec2MetadataHandler,
		ReadTimeout:    10 * time.Second,
		WriteTimeout:   10 * time.Second,
		MaxHeaderBytes: 1 << 20,
	}
	go func() {
		s.ListenAndServe()
		t.Log("HTTP server for mock Provisioner and GCP metadata endpoints stopped")
	}()
	var err error
	config, err = loadConfig(filepath.Join(testdataDir, t.Name(), "generic-worker.config"), false, true)
	if err != nil {
		t.Fatalf("Error: %v", err)
	}
	return func() {
		teardown()
		err := s.Shutdown(context.Background())
		if err != nil {
			t.Fatalf("Error shutting down http server: %v", err)
		}
		GCPMetadataBaseURL = oldGCPMetadataBaseURL
		configureForGCP = false
	}
}
