package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/taskcluster/slugid-go/slugid"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/queue"
)

var (
	inAnHour tcclient.Time
	cwd      string
)

func setup(t *testing.T) {
	// some basic setup...
	var err error
	cwd, err = os.Getwd()
	if err != nil {
		t.Fatalf("Test failed during setup phase!")
	}
	TaskUser.HomeDir = filepath.Join(cwd, "testdata")
	clientID := os.Getenv("TASKCLUSTER_CLIENT_ID")
	accessToken := os.Getenv("TASKCLUSTER_ACCESS_TOKEN")
	certificate := os.Getenv("TASKCLUSTER_CERTIFICATE")

	// configure the worker
	config = &Config{
		ProvisionerID:              "test-provisioner",
		SigningKeyLocation:         filepath.Join("testdata", "private-opengpg-key"),
		AccessToken:                accessToken,
		Certificate:                certificate,
		ClientID:                   clientID,
		RefreshUrlsPrematurelySecs: 310,
		WorkerGroup:                "test-worker-group",
		WorkerID:                   "test-worker-id",
		WorkerType:                 slugid.Nice(),
		LiveLogExecutable:          "livelog",
		LiveLogSecret:              "xyz",
		PublicIP:                   net.ParseIP("12.34.56.78"),
		PrivateIP:                  net.ParseIP("87.65.43.21"),
		InstanceID:                 "test-instance-id",
		InstanceType:               "p3.enormous",
		Region:                     "outer-space",
		Subdomain:                  "taskcluster-worker.net",
		RunTasksAsCurrentUser:      true,
		WorkerTypeMetadata: map[string]interface{}{
			"aws": map[string]string{
				"ami-id":            "test-ami",
				"availability-zone": "outer-space",
				"instance-id":       "test-instance-id",
				"instance-type":     "p3.enormous",
				"public-ipv4":       "12.34.56.78",
				"local-ipv4":        "87.65.43.21",
			},
			"generic-worker": map[string]string{
				"go-arch":    runtime.GOARCH,
				"go-os":      runtime.GOOS,
				"go-version": runtime.Version(),
				"release":    "test-release-url",
				"version":    version,
			},
			"machine-setup": map[string]string{
				"maintainer": "pmoore@mozilla.com",
				"script":     "test-script-url",
			},
		},
		CachesDir:               filepath.Join(cwd, "caches"),
		DownloadsDir:            filepath.Join(cwd, "downloads"),
		IdleShutdownTimeoutSecs: 60,
		NumberOfTasksToRun:      1,
	}

	// useful for expiry dates of tasks
	inAnHour = tcclient.Time(time.Now().Add(time.Hour * 1))
}

func runTask(t *testing.T, td *queue.TaskDefinitionRequest, payload GenericWorkerPayload) (taskID string, myQueue *queue.Queue) {
	taskID = slugid.Nice()
	// check we have all the env vars we need to run this test
	if config.ClientID == "" || config.AccessToken == "" {
		t.Skip("Skipping test since TASKCLUSTER_CLIENT_ID and/or TASKCLUSTER_ACCESS_TOKEN env vars not set")
	}
	creds := &tcclient.Credentials{
		ClientID:    config.ClientID,
		AccessToken: config.AccessToken,
		Certificate: config.Certificate,
	}
	myQueue = queue.New(creds)

	// submit task
	b, err := json.Marshal(&payload)
	if err != nil {
		t.Fatalf("Could not convert task payload to json")
	}

	payloadJSON := json.RawMessage{}
	err = json.Unmarshal(b, &payloadJSON)
	if err != nil {
		t.Fatalf("Could not convert json bytes of payload to json.RawMessage")
	}

	td.Payload = payloadJSON

	_, err = myQueue.CreateTask(taskID, td)
	if err != nil {
		t.Fatalf("Could not run task: %v", err)
	}

	// run the worker for one task only - note, the function will also return
	// if there is a minute of idle time (see config above)
	runWorker()
	return
}

func testTask() *queue.TaskDefinitionRequest {
	created := time.Now().UTC()
	// reset nanoseconds
	created = created.Add(time.Nanosecond * time.Duration(created.Nanosecond()*-1))
	// deadline in one hour' time
	deadline := created.Add(15 * time.Minute)
	// expiry in one day, in case we need test results
	expires := created.AddDate(0, 0, 1)
	return &queue.TaskDefinitionRequest{
		Created:      tcclient.Time(created),
		Deadline:     tcclient.Time(deadline),
		Expires:      tcclient.Time(expires),
		Extra:        json.RawMessage(`{}`),
		Dependencies: []string{},
		Requires:     "all-completed",
		Metadata: struct {
			Description string `json:"description"`
			Name        string `json:"name"`
			Owner       string `json:"owner"`
			Source      string `json:"source"`
		}{
			Description: "Test task",
			Name:        "[TC] TestUpload",
			Owner:       "pmoore@mozilla.com",
			Source:      "https://github.com/taskcluster/generic-worker/blob/master/artifacts_test.go",
		},
		Payload:       json.RawMessage(``),
		ProvisionerID: config.ProvisionerID,
		Retries:       1,
		Routes:        []string{},
		SchedulerID:   "test-scheduler",
		Scopes:        []string{},
		Tags:          json.RawMessage(`{"createdForUser":"pmoore@mozilla.com"}`),
		Priority:      "normal",
		TaskGroupID:   taskGroupID,
		WorkerType:    config.WorkerType,
	}
}

func checkSHA256(t *testing.T, sha256Hex string, file string) {
	hasher := sha256.New()
	f, err := os.Open(file)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if _, err := io.Copy(hasher, f); err != nil {
		t.Fatal(err)
	}
	if actualSHA256Hex := hex.EncodeToString(hasher.Sum(nil)); actualSHA256Hex != sha256Hex {
		t.Errorf("Expected file %v to have SHA256 %v but it was %v", file, sha256Hex, actualSHA256Hex)
	}
}

func toRawMessageArray(t *testing.T, x interface{}) []json.RawMessage {
	b, err := json.Marshal(x)
	if err != nil {
		t.Fatalf("Could not convert %v to json", x)
	}

	rawMessageArray := []json.RawMessage{}
	err = json.Unmarshal(b, &rawMessageArray)
	if err != nil {
		t.Fatalf("Could not convert json bytes to []json.RawMessage")
	}
	return rawMessageArray
}
