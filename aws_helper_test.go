package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/taskcluster/slugid-go/slugid"
)

type MockAWSProvisionedEnvironment struct {
	SecretFiles     []map[string]string
	Terminating     bool
	PretendMetadata string
}

func WriteJSON(t *testing.T, w http.ResponseWriter, resp interface{}) {
	bytes, err := json.MarshalIndent(resp, "", "  ")
	if err != nil {
		t.Fatalf("Strange - I can't convert %#v to json: %v", resp, err)
	}
	w.Write(bytes)
}

func (m *MockAWSProvisionedEnvironment) Setup(t *testing.T) func() {
	teardown := setupEnvironment(t)
	workerType := slugid.Nice()
	configureForAws = true
	oldEC2MetadataBaseURL := EC2MetadataBaseURL
	EC2MetadataBaseURL = "http://localhost:13243/latest"

	// Create custom *http.ServeMux rather than using http.DefaultServeMux, so
	// registered handler functions won't interfere with future tests that also
	// use http.DefaultServeMux.
	ec2MetadataHandler := http.NewServeMux()
	ec2MetadataHandler.HandleFunc("/", func(w http.ResponseWriter, req *http.Request) {
		switch req.URL.Path {

		// simulate provisioner endpoints

		case "/provisioner/worker-type/" + workerType:
			resp := map[string]interface{}{
				"secrets": m.Secrets(t),
			}
			WriteJSON(t, w, resp)
		case "/provisioner/secret/12345":
			resp := map[string]interface{}{
				"data": m.Secrets(t),
				"credentials": map[string]string{
					"clientId":    os.Getenv("TASKCLUSTER_CLIENT_ID"),
					"certificate": os.Getenv("TASKCLUSTER_CERTIFICATE"),
					"accessToken": os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
				},
				"scopes": []string{},
			}
			WriteJSON(t, w, resp)

		// simulate AWS endpoints

		case "/latest/meta-data/ami-id":
			fmt.Fprint(w, "test-ami")
		case "/latest/meta-data/spot/termination-time":
			if m.Terminating {
				fmt.Fprint(w, "time to die")
			} else {
				w.WriteHeader(404)
			}
		case "/latest/meta-data/placement/availability-zone":
			fmt.Fprint(w, "outer-space")
		case "/latest/meta-data/instance-type":
			fmt.Fprint(w, "p3.teenyweeny")
		case "/latest/meta-data/instance-id":
			fmt.Fprint(w, "test-instance-id")
		case "/latest/meta-data/public-hostname":
			fmt.Fprint(w, "MadamaButterfly")
		case "/latest/meta-data/local-ipv4":
			fmt.Fprint(w, "87.65.43.21")
		case "/latest/meta-data/public-ipv4":
			fmt.Fprint(w, "12.34.56.78")
		case "/latest/user-data":
			resp := map[string]interface{}{
				"data":                map[string]interface{}{},
				"capacity":            1,
				"workerType":          workerType,
				"provisionerId":       "test-provisioner",
				"region":              "test-worker-group",
				"availabilityZone":    "neuss-germany",
				"instanceType":        "p3.teenyweeny",
				"spotBid":             3.5,
				"price":               3.02,
				"launchSpecGenerated": time.Now(),
				"lastModified":        time.Now().Add(time.Minute * -30),
				"provisionerBaseUrl":  "http://localhost:13243/provisioner",
				"securityToken":       "12345",
			}
			WriteJSON(t, w, resp)
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
		t.Log("HTTP server for mock Provisioner and EC2 metadata endpoints stopped")
	}()
	var err error
	config, err = loadConfig(filepath.Join(testdataDir, t.Name(), "generic-worker.config"), true)
	if err != nil {
		t.Fatalf("Error: %v", err)
	}
	return func() {
		teardown()
		err := s.Shutdown(context.Background())
		if err != nil {
			t.Fatalf("Error shutting down http server: %v", err)
		}
		EC2MetadataBaseURL = oldEC2MetadataBaseURL
		configureForAws = false
	}
}

func (m *MockAWSProvisionedEnvironment) Secrets(t *testing.T) interface{} {

	gwConfig := map[string]interface{}{
		"config": map[string]interface{}{
			// Need common caches directory across tests, since files
			// directory-caches.json and file-caches.json are not per-test.
			"cachesDir":       filepath.Join(cwd, "caches"),
			"cleanUpTaskDirs": false,
			"deploymentId":    "sdkfjh4zxmnf",
			"disableReboots":  true,
			// Need common downloads directory across tests, since files
			// directory-caches.json and file-caches.json are not per-test.
			"downloadsDir":       filepath.Join(cwd, "downloads"),
			"idleTimeoutSecs":    60,
			"livelogSecret":      "I have to confess, when me and my friends sort of used to run through the fields of wheat, um, the farmers weren't too pleased about that.",
			"numberOfTasksToRun": 1,
			// should be enough for tests, and travis-ci.org CI environments
			// don't have a lot of free disk
			"requiredDiskSpaceMegabytes":     16,
			"runTasksAsCurrentUser":          os.Getenv("GW_TESTS_RUN_AS_TASK_USER") == "",
			"sentryProject":                  "generic-worker-tests",
			"shutdownMachineOnIdle":          false,
			"shutdownMachineOnInternalError": false,
			"signingKeyLocation":             filepath.Join(testdataDir, "private-opengpg-key"),
			"subdomain":                      "taskcluster-worker.net",
			"tasksDir":                       filepath.Join(testdataDir, t.Name()),
			"workerTypeMetadata": map[string]interface{}{
				"machine-setup": map[string]string{
					"pretend-metadata": m.PretendMetadata,
				},
			},
		},
	}

	return map[string]interface{}{
		"files":          m.SecretFiles,
		"generic-worker": gwConfig,
	}
}
