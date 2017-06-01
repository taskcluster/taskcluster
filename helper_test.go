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

type PayloadArtifact struct {
	Expires tcclient.Time `json:"expires,omitempty"`
	Name    string        `json:"name,omitempty"`
	Path    string        `json:"path"`
	Type    string        `json:"type"`
}

var (
	inAnHour       tcclient.Time
	testdataDir    string
	globalTestName string
)

func setup(t *testing.T, testName string) {
	// some basic setup...
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("Test failed during setup phase!")
	}
	testdataDir = filepath.Join(cwd, "testdata")

	// configure the worker
	config = &Config{
		AccessToken:                    os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
		CachesDir:                      filepath.Join(cwd, "caches"),
		Certificate:                    os.Getenv("TASKCLUSTER_CERTIFICATE"),
		CheckForNewDeploymentEverySecs: 0,
		CleanUpTaskDirs:                false,
		ClientID:                       os.Getenv("TASKCLUSTER_CLIENT_ID"),
		DeploymentID:                   "",
		DownloadsDir:                   filepath.Join(cwd, "downloads"),
		IdleTimeoutSecs:                60,
		InstanceID:                     "test-instance-id",
		InstanceType:                   "p3.enormous",
		LiveLogCertificate:             "",
		LiveLogExecutable:              "livelog",
		LiveLogGETPort:                 30582,
		LiveLogKey:                     "",
		LiveLogPUTPort:                 43264,
		LiveLogSecret:                  "xyz",
		NumberOfTasksToRun:             1,
		PrivateIP:                      net.ParseIP("87.65.43.21"),
		ProvisionerID:                  "test-provisioner",
		PublicIP:                       net.ParseIP("12.34.56.78"),
		RefreshUrlsPrematurelySecs:     310,
		Region: "outer-space",
		RequiredDiskSpaceMegabytes:     1024,
		RunTasksAsCurrentUser:          true,
		ShutdownMachineOnIdle:          false,
		ShutdownMachineOnInternalError: false,
		SigningKeyLocation:             filepath.Join("testdata", "private-opengpg-key"),
		Subdomain:                      "taskcluster-worker.net",
		TasksDir:                       filepath.Join(testdataDir, testName),
		WorkerGroup:                    "test-worker-group",
		WorkerID:                       "test-worker-id",
		WorkerType:                     slugid.Nice(),
		WorkerTypeMetadata: map[string]interface{}{
			"aws": map[string]string{
				"ami-id":            "test-ami",
				"availability-zone": "outer-space",
				"instance-id":       "test-instance-id",
				"instance-type":     "p3.enormous",
				"local-ipv4":        "87.65.43.21",
				"public-ipv4":       "12.34.56.78",
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
	}

	if os.Getenv("GW_TESTS_GENERATE_USERS") != "" {
		config.RunTasksAsCurrentUser = false
	}

	// Needed for tests that don't call RunWorker()
	// but test methods/functions directly
	taskContext = &TaskContext{
		TaskDir: testdataDir,
	}

	// useful for expiry dates of tasks
	inAnHour = tcclient.Time(time.Now().Add(time.Hour * 1))
	globalTestName = testName
}

func teardown(t *testing.T) {
	// note for tests that don't submit a task, they will have
	// taskContext.TasksDir set to the testdata subfolder, and we don't
	// want to delete that, which is why we delete the TasksDir
	err := os.RemoveAll(Config.TasksDir)
	if err != nil {
		t.Fatalf("Not able to clean up after test: %v", err)
	}
}

func executeTask(t *testing.T, td *queue.TaskDefinitionRequest, payload GenericWorkerPayload) (taskID string, myQueue *queue.Queue) {
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
	taskID = slugid.Nice()

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

	// submit task
	_, err = myQueue.CreateTask(taskID, td)
	if err != nil {
		t.Fatalf("Could not submit task: %v", err)
	}

	err = UpdateTasksResolvedFile(0)
	if err != nil {
		t.Fatalf("Test setup failure - could not write to tasks-resolved-count.txt file: %v", err)
	}
	exitCode := RunWorker()

	if exitCode != TASKS_COMPLETE {
		t.Fatalf("Something went wrong executing worker - got exit code %v but was expecting exit code %v", exitCode, TASKS_COMPLETE)
	}

	return
}

func testTask(t *testing.T) *queue.TaskDefinitionRequest {
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
			Name:        "[TC] Generic Worker CI - " + globalTestName,
			Owner:       "generic-worker-ci@mozilla.com",
			Source:      "https://github.com/taskcluster/generic-worker",
		},
		Payload:       json.RawMessage(``),
		ProvisionerID: config.ProvisionerID,
		Retries:       1,
		Routes:        []string{},
		SchedulerID:   "test-scheduler",
		Scopes:        []string{},
		Tags:          json.RawMessage(`{"CI":"generic-worker"}`),
		Priority:      "lowest",
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
