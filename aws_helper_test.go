package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/taskcluster/taskcluster-client-go/tcpurgecache"
	"github.com/taskcluster/taskcluster-client-go/tcqueue"
)

type MockAWSProvisionedEnvironment struct {
	PublicFiles                      []map[string]string
	PrivateFiles                     []map[string]string
	PublicConfig                     map[string]interface{}
	PrivateConfig                    map[string]interface{}
	WorkerTypeSecretFunc             func(t *testing.T, w http.ResponseWriter)
	WorkerTypeDefinitionUserDataFunc func(t *testing.T) interface{}
	Terminating                      bool
	PretendMetadata                  string
	OldDeploymentID                  string
	NewDeploymentID                  string
	// Set when provisioner secret (credentials) gets deleted
	SecretDeleted bool
}

func (m *MockAWSProvisionedEnvironment) ValidPublicConfig(t *testing.T) map[string]interface{} {
	result := map[string]interface{}{
		// Need common caches directory across tests, since files
		// directory-caches.json and file-caches.json are not per-test.
		"cachesDir":       filepath.Join(cwd, "caches"),
		"cleanUpTaskDirs": false,
		"deploymentId":    m.OldDeploymentID,
		"disableReboots":  true,
		// Need common downloads directory across tests, since files
		// directory-caches.json and file-caches.json are not per-test.
		"downloadsDir":       filepath.Join(cwd, "downloads"),
		"idleTimeoutSecs":    60,
		"numberOfTasksToRun": 1,
		// should be enough for tests, and travis-ci.org CI environments
		// don't have a lot of free disk
		"queueBaseURL":               tcqueue.New(nil, os.Getenv("TASKCLUSTER_ROOT_URL")).BaseURL,
		"purgeCacheBaseURL":          tcpurgecache.New(nil, os.Getenv("TASKCLUSTER_ROOT_URL")).BaseURL,
		"requiredDiskSpaceMegabytes": 16,
		// "secretsBaseURL":                 "http://localhost:13243/secrets",
		"sentryProject":                  "generic-worker-tests",
		"shutdownMachineOnIdle":          false,
		"shutdownMachineOnInternalError": false,
		"ed25519SigningKeyLocation":      filepath.Join(testdataDir, "ed25519_private_key"),
		"subdomain":                      "taskcluster-worker.net",
		"tasksDir":                       filepath.Join(testdataDir, t.Name()),
		"workerTypeMetadata": map[string]interface{}{
			"machine-setup": map[string]string{
				"pretend-metadata": m.PretendMetadata,
			},
		},
	}
	EngineTestSettings(result)
	return result
}

func (m *MockAWSProvisionedEnvironment) ValidPrivateConfig(t *testing.T) map[string]interface{} {
	return map[string]interface{}{
		"livelogSecret": "I have to confess, when me and my friends sort of used to run through the fields of wheat, um, the farmers weren't too pleased about that.",
	}
}

func WriteJSON(t *testing.T, w http.ResponseWriter, resp interface{}) {
	bytes, err := json.MarshalIndent(resp, "", "  ")
	if err != nil {
		t.Fatalf("Strange - I can't convert %#v to json: %v", resp, err)
	}
	w.Write(bytes)
}

func (m *MockAWSProvisionedEnvironment) workerTypeDefinition(t *testing.T, w http.ResponseWriter) {
	resp := map[string]interface{}{
		"userData": map[string]interface{}{
			"genericWorker": map[string]interface{}{
				"config": map[string]interface{}{
					"deploymentId": m.NewDeploymentID,
				},
			},
		},
	}
	WriteJSON(t, w, resp)
}

func (m *MockAWSProvisionedEnvironment) credentials(t *testing.T, w http.ResponseWriter) {
	resp := map[string]interface{}{
		"credentials": map[string]string{
			"clientId":    os.Getenv("TASKCLUSTER_CLIENT_ID"),
			"certificate": os.Getenv("TASKCLUSTER_CERTIFICATE"),
			"accessToken": os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
		},
		"scopes": []string{},
	}
	WriteJSON(t, w, resp)
}

func (m *MockAWSProvisionedEnvironment) workerTypeSecret(t *testing.T, w http.ResponseWriter) {
	if m.WorkerTypeSecretFunc != nil {
		m.WorkerTypeSecretFunc(t, w)
		return
	}
	resp := map[string]interface{}{
		"secret":  m.PrivateHostSetup(t),
		"expires": "2077-08-19T00:00:00.000Z",
	}
	WriteJSON(t, w, resp)
}

func (m *MockAWSProvisionedEnvironment) userData(t *testing.T, w http.ResponseWriter, workerType string) {
	var data interface{}
	if m.WorkerTypeDefinitionUserDataFunc != nil {
		data = m.WorkerTypeDefinitionUserDataFunc(t)
	} else {
		data = m.WorkerTypeDefinitionUserData(t)
	}
	resp := map[string]interface{}{
		"data":             data,
		"capacity":         1,
		"workerType":       workerType,
		"provisionerId":    "test-provisioner",
		"region":           "test-worker-group",
		"availabilityZone": "neuss-germany",
		"instanceType":     "p3.teenyweeny",
		"spotBid":          3.5,
		"price":            3.02,
		// "taskclusterRootUrl":  os.Getenv("TASKCLUSTER_ROOT_URL"), // don't use tcclient.RootURLFromEnvVars() since we don't want ClientID of CI
		"taskclusterRootUrl":  "http://localhost:13243",
		"launchSpecGenerated": time.Now(),
		"lastModified":        time.Now().Add(time.Minute * -30),
		// "provisionerBaseUrl":  "http://localhost:13243/provisioner",
		"securityToken": "12345",
	}
	WriteJSON(t, w, resp)
}

func (m *MockAWSProvisionedEnvironment) WorkerTypeDefinitionUserData(t *testing.T) map[string]map[string]interface{} {

	workerTypeDefinitionUserData := map[string]map[string]interface{}{
		"genericWorker": map[string]interface{}{},
	}
	if m.PublicConfig != nil {
		workerTypeDefinitionUserData["genericWorker"]["config"] = m.PublicConfig
	} else {
		workerTypeDefinitionUserData["genericWorker"]["config"] = m.ValidPublicConfig(t)
	}
	if m.PublicFiles != nil {
		workerTypeDefinitionUserData["genericWorker"]["files"] = m.PublicFiles
	}
	return workerTypeDefinitionUserData
}

func (m *MockAWSProvisionedEnvironment) PrivateHostSetup(t *testing.T) interface{} {

	privateHostSetup := map[string]interface{}{}

	if m.PrivateConfig != nil {
		privateHostSetup["config"] = m.PrivateConfig
	} else {
		privateHostSetup["config"] = m.ValidPrivateConfig(t)
	}
	if m.PrivateFiles != nil {
		privateHostSetup["files"] = m.PrivateFiles
	}
	return privateHostSetup
}

func (m *MockAWSProvisionedEnvironment) Setup(t *testing.T) (teardown func(), err error) {
	td := setupEnvironment(t)
	workerType := testWorkerType()
	configureForAWS = true
	oldEC2MetadataBaseURL := EC2MetadataBaseURL
	EC2MetadataBaseURL = "http://localhost:13243/latest"

	// Create custom *http.ServeMux rather than using http.DefaultServeMux, so
	// registered handler functions won't interfere with future tests that also
	// use http.DefaultServeMux.
	ec2MetadataHandler := http.NewServeMux()
	ec2MetadataHandler.HandleFunc("/", func(w http.ResponseWriter, req *http.Request) {
		switch req.URL.EscapedPath() {

		// simulate provisioner endpoints
		case "/api/aws-provisioner/v1/worker-type/" + workerType:
			m.workerTypeDefinition(t, w)
		case "/api/aws-provisioner/v1/secret/12345":
			switch req.Method {
			case "GET":
				m.credentials(t, w)
			case "DELETE":
				fmt.Fprint(w, "Credentials deleted, yay!")
				m.SecretDeleted = true
			default:
				w.WriteHeader(400)
			}

		// simulate taskcluster secrets endpoints
		case "/api/secrets/v1/secret/worker-type%3Atest-provisioner%2F" + workerType:
			m.workerTypeSecret(t, w)

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
			m.userData(t, w, workerType)
		default:
			w.WriteHeader(400)
			fmt.Fprintf(w, "Cannot serve URL %v", req.URL)
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
	config, err = loadConfig(filepath.Join(testdataDir, t.Name(), "generic-worker.config"), true, false)
	return func() {
		td()
		err := s.Shutdown(context.Background())
		if err != nil {
			t.Fatalf("Error shutting down http server: %v", err)
		}
		if !m.SecretDeleted {
			t.Fatal("Provisioner secret (credentials) not deleted")
		}
		EC2MetadataBaseURL = oldEC2MetadataBaseURL
		configureForAWS = false
	}, err
}

func (m *MockAWSProvisionedEnvironment) ExpectError(t *testing.T, errorText string) (teardown func()) {
	var err error
	teardown, err = m.Setup(t)
	if err == nil || !strings.Contains(err.Error(), errorText) {
		t.Fatalf("Was expecting error to include %q but got: %v", errorText, err)
	}
	return
}

func (m *MockAWSProvisionedEnvironment) ExpectNoError(t *testing.T) (teardown func()) {
	var err error
	teardown, err = m.Setup(t)
	if err != nil {
		t.Fatalf("Was expecting no error but got: %v", err)
	}
	return
}
