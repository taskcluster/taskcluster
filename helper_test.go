package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/taskcluster/generic-worker/gwconfig"
	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/slugid-go/slugid"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/tcqueue"
)

var (
	inAnHour       tcclient.Time
	globalTestName string
	testQueue      *tcqueue.Queue
	testdataDir    = filepath.Join(cwd, "testdata")
)

func setupEnvironment(t *testing.T, testName string) (teardown func()) {

	testDir := filepath.Join(testdataDir, testName)

	for _, dir := range []string{
		filepath.Join(cwd, "downloads"),
		filepath.Join(cwd, "caches"),
		testDir,
	} {
		// even though we know parent directory exists, use MkdirAll instead of
		// Mkdir since we don't want to fail if child directory already exists
		err := os.MkdirAll(dir, 0755)
		if err != nil {
			t.Fatalf("Could not create directory %v", dir)
		}
	}

	// Needed for tests that don't call RunWorker()
	// but test methods/functions directly
	taskContext = &TaskContext{
		TaskDir: testdataDir,
	}

	// useful for expiry dates of tasks
	inAnHour = tcclient.Time(time.Now().Add(time.Hour * 1))
	globalTestName = testName

	testQueue = NewQueue(t)

	return func() {
		// note for tests that don't submit a task, they will have
		// taskContext.TasksDir set to the testdata subfolder, and we don't
		// want to delete that, which is why we delete the TasksDir
		err := os.RemoveAll(testDir)
		if err != nil {
			t.Logf("WARNING: Not able to clean up after test: %v", err)
		}
		taskContext = nil
		globalTestName = ""
		testQueue = nil
		config = nil
	}
}

func setup(t *testing.T, testName string) (teardown func()) {
	teardown = setupEnvironment(t, testName)
	// configure the worker
	testDir := filepath.Join(testdataDir, testName)
	config = &gwconfig.Config{
		AccessToken:      os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
		AvailabilityZone: "outer-space",
		// Need common caches directory across tests, since files
		// directory-caches.json and file-caches.json are not per-test.
		CachesDir:                      filepath.Join(cwd, "caches"),
		Certificate:                    os.Getenv("TASKCLUSTER_CERTIFICATE"),
		CheckForNewDeploymentEverySecs: 0,
		CleanUpTaskDirs:                false,
		ClientID:                       os.Getenv("TASKCLUSTER_CLIENT_ID"),
		DeploymentID:                   "",
		DisableReboots:                 true,
		// Need common downloads directory across tests, since files
		// directory-caches.json and file-caches.json are not per-test.
		DownloadsDir:       filepath.Join(cwd, "downloads"),
		IdleTimeoutSecs:    60,
		InstanceID:         "test-instance-id",
		InstanceType:       "p3.enormous",
		LiveLogCertificate: "",
		LiveLogExecutable:  "livelog",
		LiveLogGETPort:     30582,
		LiveLogKey:         "",
		LiveLogPUTPort:     43264,
		LiveLogSecret:      "xyz",
		NumberOfTasksToRun: 1,
		PrivateIP:          net.ParseIP("87.65.43.21"),
		ProvisionerID:      "test-provisioner",
		PublicIP:           net.ParseIP("12.34.56.78"),
		Region:             "test-worker-group",
		// should be enough for tests, and travis-ci.org CI environments don't
		// have a lot of free disk
		RequiredDiskSpaceMegabytes:     16,
		RunAfterUserCreation:           "",
		RunTasksAsCurrentUser:          os.Getenv("GW_TESTS_GENERATE_USERS") == "",
		SentryProject:                  "generic-worker-tests",
		ShutdownMachineOnIdle:          false,
		ShutdownMachineOnInternalError: false,
		SigningKeyLocation:             filepath.Join(testdataDir, "private-opengpg-key"),
		Subdomain:                      "taskcluster-worker.net",
		TaskclusterProxyExecutable:     "taskcluster-proxy",
		TaskclusterProxyPort:           34569,
		TasksDir:                       testDir,
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
	return teardown
}

func NewQueue(t *testing.T) *tcqueue.Queue {
	// check we have all the env vars we need to run this test
	if os.Getenv("TASKCLUSTER_CLIENT_ID") == "" || os.Getenv("TASKCLUSTER_ACCESS_TOKEN") == "" {
		t.Skip("Skipping test since TASKCLUSTER_CLIENT_ID and/or TASKCLUSTER_ACCESS_TOKEN env vars not set")
	}
	return tcqueue.NewFromEnv()
}

func scheduleTask(t *testing.T, td *tcqueue.TaskDefinitionRequest, payload GenericWorkerPayload) (taskID string) {
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
	_, err = testQueue.CreateTask(taskID, td)
	if err != nil {
		t.Fatalf("Could not submit task: %v", err)
	}
	t.Logf("Scheduled task %v", taskID)

	return
}

func execute(t *testing.T, expectedExitCode ExitCode) {
	err := UpdateTasksResolvedFile(0)
	if err != nil {
		t.Fatalf("Test setup failure - could not write to tasks-resolved-count.txt file: %v", err)
	}
	exitCode := RunWorker()

	if exitCode != expectedExitCode {
		t.Fatalf("Something went wrong executing worker - got exit code %v but was expecting exit code %v", exitCode, expectedExitCode)
	} else {
		t.Logf("Worker exited with exit code %v as required.", exitCode)
	}
}

func testTask(t *testing.T) *tcqueue.TaskDefinitionRequest {
	created := time.Now().UTC()
	// reset nanoseconds
	created = created.Add(time.Nanosecond * time.Duration(created.Nanosecond()*-1))
	// deadline in one hour' time
	deadline := created.Add(15 * time.Minute)
	// expiry in two weeks, in case we need test results
	expires := created.AddDate(0, 0, 14)
	return &tcqueue.TaskDefinitionRequest{
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

type ArtifactTraits struct {
	Extracts        []string
	ContentType     string
	ContentEncoding string
	Expires         tcclient.Time
}

type ExpectedArtifacts map[string]ArtifactTraits

func (expectedArtifacts ExpectedArtifacts) Validate(t *testing.T, taskID string, run int) {

	artifacts, err := testQueue.ListArtifacts(taskID, strconv.Itoa(run), "", "")

	if err != nil {
		t.Fatalf("Error listing artifacts: %v", err)
	}

	actualArtifacts := make(map[string]struct {
		ContentType string        `json:"contentType"`
		Expires     tcclient.Time `json:"expires"`
		Name        string        `json:"name"`
		StorageType string        `json:"storageType"`
	}, len(artifacts.Artifacts))

	for _, actualArtifact := range artifacts.Artifacts {
		actualArtifacts[actualArtifact.Name] = actualArtifact
	}

	for artifact, expected := range expectedArtifacts {
		if actual, ok := actualArtifacts[artifact]; ok {
			if actual.ContentType != expected.ContentType {
				t.Errorf("Artifact %s should have mime type '%v' but has '%s'", artifact, expected.ContentType, actual.ContentType)
			}
			if !time.Time(expected.Expires).IsZero() {
				if actual.Expires.String() != expected.Expires.String() {
					t.Errorf("Artifact %s should have expiry '%s' but has '%s'", artifact, expected.Expires, actual.Expires)
				}
			}
		} else {
			t.Errorf("Artifact '%s' not created", artifact)
		}
		b, rawResp, resp, url := getArtifactContent(t, taskID, artifact)
		for _, requiredSubstring := range expected.Extracts {
			if strings.Index(string(b), requiredSubstring) < 0 {
				t.Errorf("Artifact '%s': Could not find substring %q in '%s'", artifact, requiredSubstring, string(b))
			}
		}
		if actualContentEncoding := rawResp.Header.Get("Content-Encoding"); actualContentEncoding != expected.ContentEncoding {
			t.Fatalf("Expected Content-Encoding %q but got Content-Encoding %q for artifact %q from url %v", expected.ContentEncoding, actualContentEncoding, artifact, url)
		}
		if actualContentType := resp.Header.Get("Content-Type"); actualContentType != expected.ContentType {
			t.Fatalf("Content-Type in Signed URL %v response (%v) does not match Content-Type of artifact (%v)", url, actualContentType, expected.ContentType)
		}
	}
}

func getArtifactContent(t *testing.T, taskID string, artifact string) ([]byte, *http.Response, *http.Response, *url.URL) {
	url, err := testQueue.GetLatestArtifact_SignedURL(taskID, artifact, 10*time.Minute)
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
	if state == "exception" && reason == "worker-shutdown" {
		execute(t, WORKER_SHUTDOWN)
	} else {
		execute(t, TASKS_COMPLETE)
	}
	status, err := testQueue.Status(taskID)
	if err != nil {
		t.Fatal("Error retrieving status from queue")
	}
	if status.Status.Runs[0].State != state || status.Status.Runs[0].ReasonResolved != reason {
		t.Fatalf("Expected task %v to resolve as '%v/%v' but resolved as '%v/%v'", taskID, state, reason, status.Status.Runs[0].State, status.Status.Runs[0].ReasonResolved)
	} else {
		t.Logf("Task %v resolved as %v/%v as required.", taskID, status.Status.Runs[0].State, status.Status.Runs[0].ReasonResolved)
	}
}

func submitAndAssert(t *testing.T, td *tcqueue.TaskDefinitionRequest, payload GenericWorkerPayload, state, reason string) (taskID string) {
	taskID = scheduleTask(t, td, payload)
	ensureResolution(t, taskID, state, reason)
	return taskID
}

func expectChainOfTrustKeyNotSecureMessage(t *testing.T, td *tcqueue.TaskDefinitionRequest, payload GenericWorkerPayload) {
	taskID := submitAndAssert(t, td, payload, "exception", "malformed-payload")

	expectedArtifacts := ExpectedArtifacts{
		"public/logs/live_backing.log": {
			Extracts: []string{
				ChainOfTrustKeyNotSecureMessage,
			},
			ContentType:     "text/plain; charset=utf-8",
			ContentEncoding: "gzip",
		},
	}

	expectedArtifacts.Validate(t, taskID, 0)
	return
}

func checkSHA256OfFile(t *testing.T, path string, SHA256 string) {
	f, err := os.Open(path)
	if err != nil {
		t.Fatalf("Could not open file %v: %v", path, err)
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		t.Fatalf("Error reading from file %v: %v", path, err)
	}
	actualSHA256 := fmt.Sprintf("%x", h.Sum(nil))
	if actualSHA256 != SHA256 {
		t.Fatalf("Expected SHA256 of %v to be %v but was %v", path, SHA256, actualSHA256)
	} else {
		t.Logf("SHA256 of %v correct (%v = %v)", path, SHA256, actualSHA256)
	}
}
