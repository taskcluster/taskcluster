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

	"github.com/pborman/uuid"
	"github.com/taskcluster/generic-worker/gwconfig"
	"github.com/taskcluster/generic-worker/testutil"
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

func setupEnvironment(t *testing.T) (teardown func()) {

	testDir := filepath.Join(testdataDir, t.Name())

	for _, dir := range []string{
		filepath.Join(cwd, "downloads"),
		filepath.Join(cwd, "caches"),
		testDir,
	} {
		err := os.RemoveAll(dir)
		if err != nil {
			t.Fatalf("Could not remove directory %v: %v", dir, err)
		}
		err = os.Mkdir(dir, 0755)
		if err != nil {
			t.Fatalf("Could not create directory %v: %v", dir, err)
		}
	}

	for _, file := range []string{
		filepath.Join(cwd, "file-caches.json"),
		filepath.Join(cwd, "directory-caches.json"),
	} {
		err := os.RemoveAll(file)
		if err != nil {
			t.Fatalf("Could not remove file %v: %v", file, err)
		}
	}

	// Needed for tests that don't call RunWorker()
	// but test methods/functions directly
	taskContext = &TaskContext{
		TaskDir: testdataDir,
	}

	// useful for expiry dates of tasks
	inAnHour = tcclient.Time(time.Now().Add(time.Hour * 1))
	globalTestName = t.Name()

	testQueue = NewQueue(t)

	return func() {
		// note for tests that don't submit a task, they will have
		// taskContext.TaskDir set to the testdata subfolder, and we don't
		// want to delete that, which is why we delete testDir and not
		// config.TasksDir or taskContext.TaskDir
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

func setup(t *testing.T) (teardown func()) {
	teardown = setupEnvironment(t)
	// configure the worker
	testDir := filepath.Join(testdataDir, t.Name())
	config = &gwconfig.Config{
		PrivateConfig: gwconfig.PrivateConfig{
			AccessToken:   os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
			Certificate:   os.Getenv("TASKCLUSTER_CERTIFICATE"),
			LiveLogSecret: "xyz",
		},
		PublicConfig: gwconfig.PublicConfig{
			AuthBaseURL:      "",
			AvailabilityZone: "outer-space",
			// Need common caches directory across tests, since files
			// directory-caches.json and file-caches.json are not per-test.
			CachesDir:                      filepath.Join(cwd, "caches"),
			CheckForNewDeploymentEverySecs: 0,
			CleanUpTaskDirs:                false,
			ClientID:                       os.Getenv("TASKCLUSTER_CLIENT_ID"),
			DeploymentID:                   "",
			DisableReboots:                 true,
			// Need common downloads directory across tests, since files
			// directory-caches.json and file-caches.json are not per-test.
			DownloadsDir:              filepath.Join(cwd, "downloads"),
			Ed25519SigningKeyLocation: filepath.Join(testdataDir, "ed25519_private_key"),
			IdleTimeoutSecs:           60,
			InstanceID:                "test-instance-id",
			InstanceType:              "p3.enormous",
			LiveLogCertificate:        "",
			LiveLogExecutable:         "livelog",
			LiveLogGETPort:            30582,
			LiveLogKey:                "",
			LiveLogPUTPort:            43264,
			NumberOfTasksToRun:        1,
			PrivateIP:                 net.ParseIP("87.65.43.21"),
			ProvisionerBaseURL:        "",
			ProvisionerID:             "test-provisioner",
			PublicIP:                  net.ParseIP("12.34.56.78"),
			PurgeCacheBaseURL:         "",
			QueueBaseURL:              "",
			Region:                    "test-worker-group",
			// should be enough for tests, and travis-ci.org CI environments don't
			// have a lot of free disk
			RequiredDiskSpaceMegabytes:     16,
			RootURL:                        os.Getenv("TASKCLUSTER_ROOT_URL"),
			RunAfterUserCreation:           "",
			SentryProject:                  "generic-worker-tests",
			ShutdownMachineOnIdle:          false,
			ShutdownMachineOnInternalError: false,
			Subdomain:                      "taskcluster-worker.net",
			TaskclusterProxyExecutable:     "taskcluster-proxy",
			TaskclusterProxyPort:           34569,
			TasksDir:                       testDir,
			WorkerGroup:                    "test-worker-group",
			WorkerID:                       "test-worker-id",
			WorkerType:                     testWorkerType(),
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
		},
	}
	configProvider = &TestProvider{}
	setConfigRunTasksAsCurrentUser()
	return teardown
}

type TestProvider struct{}

func (tp *TestProvider) NewestDeploymentID() (string, error) {
	return config.DeploymentID, nil
}

func (tp *TestProvider) UpdateConfig(c *gwconfig.Config) error {
	return nil
}

// testWorkerType returns a fake workerType identifier that conforms to
// workerType naming restrictions.
//
// See https://bugzil.la/1553953
func testWorkerType() string {
	return "test-" + strings.ToLower(strings.Replace(slugid.Nice(), "_", "", -1)) + "-a"
}

func NewQueue(t *testing.T) *tcqueue.Queue {
	testutil.RequireTaskclusterCredentials(t)
	// BaseURL shouldn't be proxy otherwise requests will use CI clientId
	// rather than env var TASKCLUSTER_CLIENT_ID
	return tcqueue.New(tcclient.CredentialsFromEnvVars(), os.Getenv("TASKCLUSTER_ROOT_URL"))
}

func scheduleTask(t *testing.T, td *tcqueue.TaskDefinitionRequest, payload GenericWorkerPayload) (taskID string) {
	taskID = slugid.Nice()
	scheduleNamedTask(t, td, payload, taskID)
	return
}

func scheduleNamedTask(t *testing.T, td *tcqueue.TaskDefinitionRequest, payload GenericWorkerPayload, taskID string) {

	if td.Payload == nil {
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
	}

	// submit task
	_, err := testQueue.CreateTask(taskID, td)
	if err != nil {
		t.Fatalf("Could not submit task: %v", err)
	}
	t.Logf("Scheduled task %v", taskID)
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
		Metadata: tcqueue.TaskMetadata{
			Description: "Test task",
			Name:        "[TC] Generic Worker CI - " + globalTestName,
			Owner:       "generic-worker-ci@mozilla.com",
			Source:      "https://github.com/taskcluster/generic-worker",
		},
		Payload:       nil,
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
		defer resp.Body.Close()
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

func toMountArray(t *testing.T, x interface{}) []json.RawMessage {
	b, err := json.Marshal(x)
	if err != nil {
		t.Fatalf("Could not convert %#v to json: %v", x, err)
	}

	rawMessageArray := []json.RawMessage{}
	err = json.Unmarshal(b, &rawMessageArray)
	if err != nil {
		t.Fatalf("Could not convert json bytes to []json.RawMessage")
	}
	return rawMessageArray
}

func cancelTask(t *testing.T) (td *tcqueue.TaskDefinitionRequest, payload GenericWorkerPayload) {
	command := goGet("github.com/taskcluster/taskcluster-client-go")
	command = append(command, goRun("resolvetask.go")...)
	payload = GenericWorkerPayload{
		Command:    command,
		MaxRunTime: 120,
		Artifacts: []Artifact{
			{
				Type:    "file",
				Path:    "resolvetask.go",
				Expires: inAnHour,
			},
		},
	}
	fullCreds := &tcclient.Credentials{
		AccessToken: config.AccessToken,
		ClientID:    config.ClientID,
		Certificate: config.Certificate,
	}
	if os.Getenv("GW_SKIP_PERMA_CREDS_TESTS") != "" {
		t.Skip("Skipping since GW_SKIP_PERMA_CREDS_TESTS env var is set")
	}
	testutil.RequireTaskclusterCredentials(t)
	if fullCreds.Certificate != "" {
		t.Fatal("Skipping since I need permanent TC credentials for this test and only have temp creds - set GW_SKIP_PERMA_CREDS_TESTS or GW_SKIP_INTEGRATION_TESTS env var to something to skip this test, or change your TASKCLUSTER_* env vars to a permanent client instead of a temporary client")
	}
	td = testTask(t)
	tempCreds, err := fullCreds.CreateNamedTemporaryCredentials("project/taskcluster:generic-worker-tester/"+t.Name(), time.Minute, "queue:cancel-task:"+td.SchedulerID+"/"+td.TaskGroupID+"/*")
	if err != nil {
		t.Fatalf("%v", err)
	}
	payload.Env = map[string]string{
		"TASKCLUSTER_CLIENT_ID":    tempCreds.ClientID,
		"TASKCLUSTER_ACCESS_TOKEN": tempCreds.AccessToken,
		"TASKCLUSTER_CERTIFICATE":  tempCreds.Certificate,
	}
	for _, envVar := range []string{
		"PATH",
		"GOPATH",
		"GOROOT",
	} {
		if v, exists := os.LookupEnv(envVar); exists {
			payload.Env[envVar] = v
		}
	}
	return
}

// CreateArtifactFromFile returns a taskID for a task with an artifact with the
// given name whose content matches the content of the local file (relative to
// the testdata folder) with the given path. It does this by creating a hash of
// the file content together with the name of the file, and then converts the
// hash into a "nice" slug. It then checks if the task already exists. If it
// does exist, it simply returns the taskID. If it doesn't, it creates the task
// and returns.
func CreateArtifactFromFile(t *testing.T, path string, name string) (taskID string) {

	// Calculate hash of file content
	rawContent, err := os.Open(filepath.Join(testdataDir, path))
	if err != nil {
		t.Fatal(err)
	}
	defer rawContent.Close()
	hasher := sha256.New()
	_, err = io.Copy(hasher, rawContent)
	if err != nil {
		t.Fatal(err)
	}

	// Append a 0 byte and the artifact name to the hash source, to ensure that
	// if the artifact name changes, we get a different taskID. Since file
	// names can't include a 0 byte, adding the zero byte as a separator
	// between the two parts ensures that a one-to-one mapping exists between
	// {file content, artifact name} and hash.
	_, err = hasher.Write(append([]byte{0}, []byte(name)...))
	if err != nil {
		t.Fatal(err)
	}

	// Use first 128 bits of 256 bit hash for UUID
	sha256 := hasher.Sum(nil)
	v4uuid := sha256[:16]

	// Comply to uuid v4 rules (mask six bits)
	v4uuid[6] = (v4uuid[6] & 0x0f) | 0x40 // Version 4
	v4uuid[8] = (v4uuid[8] & 0x3f) | 0x80 // Variant is 10

	// Make slugid a "nice" one (mask one further bit => 121 bits entropy)
	v4uuid[0] &= 0x7f

	// Convert to a string taskID
	taskID = slugid.Encode(uuid.UUID(v4uuid))

	// See if task already exists
	tdr, err := testQueue.Task(taskID)
	if err != nil {
		switch e := err.(type) {
		case *tcclient.APICallException:
			switch r := e.RootCause.(type) {
			case httpbackoff.BadHttpResponseCode:
				if r.HttpResponseCode == 404 {
					t.Logf("Creating task %q for artifact %v under path %v...", taskID, name, path)
					payload := GenericWorkerPayload{
						Command:    copyTestdataFile(path),
						MaxRunTime: 30,
						Artifacts: []Artifact{
							{
								Path: path,
								Name: name,
								Type: "file",
							},
						},
					}
					td := testTask(t)
					// Set 6 month expiry
					td.Expires = tcclient.Time(time.Now().AddDate(0, 6, 0))
					td.Metadata.Name = "Task dependency for generic-worker integration tests"
					td.Metadata.Description = fmt.Sprintf("Single artifact %v from path %v with hash %v", name, path, hex.EncodeToString(sha256))
					scheduleNamedTask(t, td, payload, taskID)
					ensureResolution(t, taskID, "completed", "completed")
					return
				}
			}
		}
		t.Fatalf("%#v", err)
	}

	// If task expires in the next two minutes, just fail intentionally. It
	// isn't worth trying to handle this situation, since the task only expires
	// after 6 months, so the chance of hitting the two minute period before it
	// expires is extremely small, and the error will explicitly report it
	// anyway.
	remainingTime := time.Time(tdr.Expires).Sub(time.Now())
	if remainingTime.Seconds() < 120 {
		t.Fatalf("You've been extremely unlucky. This test depends on task %q that was created six months ago but is due to expire in less than two minutes (%v). Wait a few minutes and try again!", taskID, remainingTime)
	}
	t.Logf("Depend on task %q which expires in %v.", taskID, remainingTime)
	return
}
