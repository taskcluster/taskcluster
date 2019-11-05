package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"testing"
	"time"

	"github.com/taskcluster/generic-worker/gwconfig"
	"github.com/taskcluster/taskcluster-client-go/tcworkermanager"
)

type MockGCPProvisionedEnvironment struct {
}

func (m *MockGCPProvisionedEnvironment) Setup(t *testing.T) func() {
	teardown := setupEnvironment(t)
	workerType := testWorkerType()
	configureForGCP = true
	oldGCPMetadataBaseURL := GCPMetadataBaseURL
	GCPMetadataBaseURL = "http://localhost:13243/computeMetadata/v1"

	// Create custom *http.ServeMux rather than using http.DefaultServeMux, so
	// registered handler functions won't interfere with future tests that also
	// use http.DefaultServeMux.
	gcpMetadataHandler := http.NewServeMux()
	gcpMetadataHandler.HandleFunc("/", func(w http.ResponseWriter, req *http.Request) {
		switch req.URL.EscapedPath() {

		// simulate GCP endpoints

		case "/computeMetadata/v1/instance/attributes/taskcluster":
			resp := map[string]interface{}{
				"workerPoolId": "test-provisioner/" + workerType,
				"providerId":   "test-provider",
				"workerGroup":  "workers",
				"rootURL":      "http://localhost:13243",
				"workerConfig": map[string]interface{}{
					"genericWorker": map[string]interface{}{
						"config": map[string]interface{}{
							"deploymentId": "12345",
						},
					},
				},
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
			fmt.Fprintf(w, "/project/1234/zone/in-central1-b")
		case "/computeMetadata/v1/instance/hostname":
			fmt.Fprintf(w, "1-2-3-4-at.google.com")
		case "/computeMetadata/v1/instance/network-interfaces/0/ip":
			fmt.Fprintf(w, "10.10.10.10")
		case "/computeMetadata/v1/project/project-id":
			fmt.Fprintf(w, "proj-1234")

		// simulate taskcluster secrets endpoints
		case "/api/secrets/v1/secret/worker-pool%3Atest-provisioner%2F" + workerType:
			w.WriteHeader(404)
			fmt.Fprintf(w, "No secret for worker type %v", workerType)

		case "/api/worker-manager/v1/worker/register":
			if req.Method != "POST" {
				w.WriteHeader(400)
				fmt.Fprintf(w, "Must register with POST")
			}
			d := json.NewDecoder(req.Body)
			d.DisallowUnknownFields()
			b := tcworkermanager.RegisterWorkerRequest{}
			err := d.Decode(&b)
			if err != nil {
				w.WriteHeader(400)
				fmt.Fprintf(w, "%v", err)
			}
			d = json.NewDecoder(bytes.NewBuffer(b.WorkerIdentityProof))
			d.DisallowUnknownFields()
			g := tcworkermanager.GoogleProviderType{}
			err = d.Decode(&g)
			if err != nil {
				w.WriteHeader(400)
				fmt.Fprintf(w, "%v", err)
			}
			if g.Token != "sekrit-token" {
				w.WriteHeader(400)
				fmt.Fprintf(w, "Got token %q but was expecting %q", g.Token, "sekrit-token")
			}
			resp := map[string]interface{}{
				"credentials": map[string]interface{}{
					"accessToken": "test-access-token",
					"certificate": "",
					"clientId":    "test-client-id",
				},
			}
			WriteJSON(t, w, resp)

		default:
			w.WriteHeader(400)
			fmt.Fprintf(w, "Cannot serve URL %q", req.URL.EscapedPath())
		}
	})
	s := &http.Server{
		Addr:           "localhost:13243",
		Handler:        gcpMetadataHandler,
		ReadTimeout:    10 * time.Second,
		WriteTimeout:   10 * time.Second,
		MaxHeaderBytes: 1 << 20,
	}
	go func() {
		s.ListenAndServe()
		t.Log("HTTP server for mock Provisioner and GCP metadata endpoints stopped")
	}()
	var err error
	configFile := &gwconfig.File{
		Path: filepath.Join(testdataDir, t.Name(), "generic-worker.config"),
	}
	configProvider, err = loadConfig(configFile, false, true)
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
