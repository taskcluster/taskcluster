package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"io/ioutil"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/taskcluster/generic-worker/gwconfig"
	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/slugid-go/slugid"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/queue"
)

type PayloadArtifact struct {
	ContentType string        `json:"contentType,omitempty"`
	Expires     tcclient.Time `json:"expires,omitempty"`
	Name        string        `json:"name,omitempty"`
	Path        string        `json:"path"`
	Type        string        `json:"type"`
}

var (
	inAnHour       tcclient.Time
	testdataDir    string
	globalTestName string
	myQueue        *queue.Queue
)

func setup(t *testing.T, testName string) {
	// some basic setup...
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("Test failed during setup phase!")
	}
	testdataDir = filepath.Join(cwd, "testdata")

	// configure the worker
	config = &gwconfig.Config{
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

	myQueue = NewQueue(t)
}

func teardown(t *testing.T) {
	// note for tests that don't submit a task, they will have
	// taskContext.TasksDir set to the testdata subfolder, and we don't
	// want to delete that, which is why we delete the TasksDir
	err := os.RemoveAll(config.TasksDir)
	if err != nil {
		t.Fatalf("Not able to clean up after test: %v", err)
	}
}

func NewQueue(t *testing.T) (myQueue *queue.Queue) {
	// check we have all the env vars we need to run this test
	if config.ClientID == "" || config.AccessToken == "" {
		t.Skip("Skipping test since TASKCLUSTER_CLIENT_ID and/or TASKCLUSTER_ACCESS_TOKEN env vars not set")
	}
	creds := &tcclient.Credentials{
		ClientID:    config.ClientID,
		AccessToken: config.AccessToken,
		Certificate: config.Certificate,
	}
	var err error
	myQueue, err = queue.New(creds)
	if err != nil {
		t.Fatalf("Invalid credentials: %v", err)
	}
	return
}

func scheduleTask(t *testing.T, td *queue.TaskDefinitionRequest, payload GenericWorkerPayload) (taskID string) {
	taskID = slugid.Nice()

	b, err := json.Marshal(&payload)
	if err != nil {
		t.Fatalf("Could not convert task payload to json")
	}
	//////////////////////////////////////////////////////////////////////////////////
	//
	// horrible hack here, until we have jsonschema2go generating pointer types...
	//
	//////////////////////////////////////////////////////////////////////////////////
	b = bytes.Replace(b, []byte(`"expires":"0001-01-01T00:00:00Z",`), []byte{}, -1)
	b = bytes.Replace(b, []byte(`,"expires":"0001-01-01T00:00:00Z"`), []byte{}, -1)

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

	return
}

func execute(t *testing.T) {
	err := UpdateTasksResolvedFile(0)
	if err != nil {
		t.Fatalf("Test setup failure - could not write to tasks-resolved-count.txt file: %v", err)
	}
	exitCode := RunWorker()

	if exitCode != TASKS_COMPLETE {
		t.Fatalf("Something went wrong executing worker - got exit code %v but was expecting exit code %v", exitCode, TASKS_COMPLETE)
	}
}

func scheduleAndExecute(t *testing.T, td *queue.TaskDefinitionRequest, payload GenericWorkerPayload) (taskID string) {
	taskID = scheduleTask(t, td, payload)
	execute(t)
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
		Tags:          map[string]string{"CI": "generic-worker"},
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

func getArtifactContent(t *testing.T, taskID string, artifact string) ([]byte, *http.Response, *http.Response, *url.URL) {
	url, err := myQueue.GetLatestArtifact_SignedURL(taskID, artifact, 10*time.Minute)
	if err != nil {
		t.Fatalf("Error trying to fetch artifacts from Amazon...\n%s", err)
	}
	// need to do this so Content-Encoding header isn't swallowed by Go for test later on
	tr := &http.Transport{
		DisableCompression: true,
	}
	client := &http.Client{Transport: tr}
	rawResp, _, err := httpbackoff.ClientGet(client, url.String())
	if err != nil {
		t.Fatalf("Error trying to fetch decompressed artifact from signed URL %s ...\n%s", url.String(), err)
	}
	resp, _, err := httpbackoff.Get(url.String())
	if err != nil {
		t.Fatalf("Error trying to fetch artifact from signed URL %s ...\n%s", url.String(), err)
	}
	b, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("Error trying to read response body of artifact from signed URL %s ...\n%s", url.String(), err)
	}
	return b, rawResp, resp, url
}

func ensureResolution(t *testing.T, taskID, state, reason string) {
	status, err := myQueue.Status(taskID)
	if err != nil {
		t.Fatal("Error retrieving status from queue")
	}
	if status.Status.State != state || status.Status.Runs[0].ReasonResolved != reason {
		t.Fatalf("Expected task %v to resolve as '%v/%v' but resolved as '%v/%v'", taskID, state, reason, status.Status.State, status.Status.Runs[0].ReasonResolved)
	}
}
