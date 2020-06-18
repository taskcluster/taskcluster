package main

import (
	"bytes"
	"context"
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
	"strings"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/pborman/uuid"
	"github.com/taskcluster/httpbackoff/v3"
	"github.com/taskcluster/slugid-go/slugid"
	tcclient "github.com/taskcluster/taskcluster/v31/clients/client-go"
	"github.com/taskcluster/taskcluster/v31/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v31/workers/generic-worker/gwconfig"
	"github.com/taskcluster/taskcluster/v31/workers/generic-worker/mockec2"
	"github.com/taskcluster/taskcluster/v31/workers/generic-worker/mocktc"
)

var (
	inAnHour       tcclient.Time
	globalTestName string
	testdataDir    = filepath.Join(cwd, "testdata")
)

func setup(t *testing.T) func() {
	test := GWTest(t)
	err := test.Setup()
	if err != nil {
		test.Teardown()
		t.Fatalf("%v", err)
	}
	return test.Teardown
}

// testWorkerType returns a fake workerType identifier that conforms to
// workerType naming restrictions.
//
// See https://bugzil.la/1553953
func testWorkerType() string {
	return "test-" + strings.ToLower(strings.Replace(slugid.Nice(), "_", "", -1)) + "-a"
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
		b = bytes.Replace(b, []byte(`"expires":"0001-01-01T00:00:00.000Z",`), []byte{}, -1)
		b = bytes.Replace(b, []byte(`,"expires":"0001-01-01T00:00:00.000Z"`), []byte{}, -1)

		payloadJSON := json.RawMessage{}
		err = json.Unmarshal(b, &payloadJSON)
		if err != nil {
			t.Fatalf("Could not convert json bytes of payload to json.RawMessage")
		}

		td.Payload = payloadJSON
	}

	// submit task
	queue := serviceFactory.Queue(config.Credentials(), config.RootURL)
	_, err := queue.CreateTask(taskID, td)
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

func getArtifactContent(t *testing.T, taskID string, artifact string) ([]byte, *http.Response, *http.Response, *url.URL) {
	queue := serviceFactory.Queue(config.Credentials(), config.RootURL)
	url, err := queue.GetLatestArtifact_SignedURL(taskID, artifact, 10*time.Minute)
	if err != nil {
		t.Fatalf("Error trying to fetch artifacts from Amazon...\n%s", err)
	}
	t.Logf("Getting from url %v", url.String())
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
	queue := serviceFactory.Queue(config.Credentials(), config.RootURL)
	status, err := queue.Status(taskID)
	if err != nil {
		t.Fatal("Error retrieving status from queue")
	}
	if status.Status.Runs[0].State != state || status.Status.Runs[0].ReasonResolved != reason {
		t.Logf("Expected task %v to resolve as '%v/%v' but resolved as '%v/%v'", taskID, state, reason, status.Status.Runs[0].State, status.Status.Runs[0].ReasonResolved)
		t.Log("Task logs:")
		// This extra space is *super-useful* for breaking up the output since
		// this shows a task log embedded inside a different task log
		t.Log("")
		t.Log("")
		t.Log("")
		t.Fatal(LogText(t))
		t.Log("")
		t.Log("")
		t.Log("")
	} else {
		t.Logf("Task %v resolved as %v/%v as required.", taskID, status.Status.Runs[0].State, status.Status.Runs[0].ReasonResolved)
	}
}

func LogText(t *testing.T) string {
	bytes, err := ioutil.ReadFile(filepath.Join(taskContext.TaskDir, logPath))
	if err != nil {
		t.Fatalf("Error when trying to read log file: %v", err)
	}
	return string(bytes)
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

// CreateArtifactFromFile returns a taskID for a task with an artifact with the
// given name whose content matches the content of the local file (relative to
// the testdata folder) with the given path. It does this by creating a hash of
// the file content together with the name of the artifact, and then converts
// the hash into a "nice" slug. It then checks if the task already exists. If
// it does exist, it simply returns the taskID. If it doesn't, it creates the
// task and returns.
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

	// Now add a fixed string which we can change if we ever need to roll
	// new artifacts, for example if we get a failure like we did for
	// https://community-tc.services.mozilla.com/tasks/RgyFPm08TxaF1c9KcpRUaQ/runs/0
	_, err = hasher.Write(append([]byte{0}, []byte("tum te tum te tum")...))
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
	queue := serviceFactory.Queue(config.Credentials(), config.RootURL)
	tdr, err := queue.Task(taskID)
	if err != nil {
		switch e := err.(type) {
		case *tcclient.APICallException:
			switch r := e.RootCause.(type) {
			case httpbackoff.BadHttpResponseCode:
				if r.HttpResponseCode == 404 {
					if engine == "docker" {
						switch serviceFactory.(type) {
						case *mocktc.ServiceFactory:
							t.Skip()
						}
						t.Fatalf("You've been extremely unlucky. This test depends on task %v with artifact %v that the docker engine can't create, but any of the other engines can create. It is created once every six months by whichever CI task first runs after the previous version expired. It looks like docker engine got there first, which is unfortunate, as it is the only one that can't create it. Probably if you rerun this test, all will be fine, because another CI task will have created it by now.", taskID, name)
					}
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
	remainingTime := time.Until(time.Time(tdr.Expires))
	if remainingTime.Seconds() < 120 {
		t.Fatalf("You've been extremely unlucky. This test depends on task %q that was created six months ago but is due to expire in less than two minutes (%v). Wait a few minutes and try again!", taskID, remainingTime)
	}
	t.Logf("Depend on task %q which expires in %v.", taskID, remainingTime)
	return
}

func ExpectError(t *testing.T, errorText string, err error) {
	if err == nil || !strings.Contains(err.Error(), errorText) {
		t.Fatalf("Was expecting error to include %q but got: %v", errorText, err)
	}
}

func ExpectNoError(t *testing.T, err error) {
	if err != nil {
		t.Fatalf("Was expecting no error but got: %v", err)
	}
}

type Test struct {
	t                     *testing.T
	Config                *gwconfig.Config
	Provider              Provider
	OldInternalPUTPort    uint16
	OldInternalGETPort    uint16
	OldEC2MetadataBaseURL string
	OldConfigureForAWS    bool
	OldConfigureForGCP    bool
	OldConfigureForAzure  bool
	srv                   *http.Server
	router                *mux.Router
}

func GWTest(t *testing.T) *Test {
	testConfig := &gwconfig.Config{
		PrivateConfig: gwconfig.PrivateConfig{
			AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
			Certificate: os.Getenv("TASKCLUSTER_CERTIFICATE"),
		},
		PublicConfig: gwconfig.PublicConfig{
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
			LiveLogExecutable:         "livelog",
			NumberOfTasksToRun:        1,
			PrivateIP:                 net.ParseIP("87.65.43.21"),
			ProvisionerID:             "test-provisioner",
			PublicIP:                  net.ParseIP("12.34.56.78"),
			Region:                    "test-worker-group",
			// should be enough for tests, and travis-ci.org CI environments don't
			// have a lot of free disk
			RequiredDiskSpaceMegabytes:     16,
			RootURL:                        "http://localhost:13243",
			RunAfterUserCreation:           "",
			SentryProject:                  "generic-worker-tests",
			ShutdownMachineOnIdle:          false,
			ShutdownMachineOnInternalError: false,
			TaskclusterProxyExecutable:     "taskcluster-proxy",
			TaskclusterProxyPort:           34569,
			TasksDir:                       filepath.Join(testdataDir, t.Name(), "tasks"),
			WorkerGroup:                    "test-worker-group",
			WorkerID:                       "test-worker-id",
			WorkerType:                     testWorkerType(),
			WorkerTypeMetadata: map[string]interface{}{
				"generic-worker": map[string]string{
					"go-arch":    runtime.GOARCH,
					"go-os":      runtime.GOOS,
					"go-version": runtime.Version(),
					"version":    version,
					"revision":   revision,
					"engine":     engine,
				},
				"parent-task": map[string]string{
					"taskId": os.Getenv("TASK_ID"),
					"runId":  os.Getenv("RUN_ID"),
				},
			},
		},
	}
	setConfigRunTasksAsCurrentUser(testConfig)
	for _, dir := range []string{
		filepath.Join(cwd, "downloads"),
		filepath.Join(cwd, "caches"),
		filepath.Join(testdataDir, t.Name()),
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

	r := mux.NewRouter().UseEncodedPath()

	if os.Getenv("GW_TESTS_USE_EXTERNAL_TASKCLUSTER") == "" {
		for _, s := range mocktc.ServiceProviders(t) {
			s.RegisterService(r)
		}
		testConfig.AccessToken = "test-access-token"
		testConfig.ClientID = "test-client-id"
		testConfig.Certificate = ""
	}

	r.NotFoundHandler = http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		w.WriteHeader(404)
		_, _ = w.Write([]byte(fmt.Sprintf("URL %v with method %v NOT FOUND\n", req.URL, req.Method)))
	})

	srv := &http.Server{
		Addr: ":13243",
		// Good practice to set timeouts to avoid Slowloris attacks.
		WriteTimeout: time.Second * 15,
		ReadTimeout:  time.Second * 15,
		IdleTimeout:  time.Second * 60,
		Handler:      r, // Pass our instance of gorilla/mux in.
	}
	go func() {
		_ = srv.ListenAndServe()
	}()

	serviceFactory = mocktc.NewServiceFactory(t)

	// we need to use a non-default port for the livelog internalGETPort, so
	// that we don't conflict with a generic-worker in which the tests are
	// running
	internalPUTPort = 30584
	internalGETPort = 30583

	return &Test{
		t:                     t,
		Config:                testConfig,
		Provider:              NO_PROVIDER,
		OldInternalPUTPort:    internalPUTPort,
		OldInternalGETPort:    internalGETPort,
		OldEC2MetadataBaseURL: EC2MetadataBaseURL,
		OldConfigureForAWS:    configureForAWS,
		OldConfigureForGCP:    configureForGCP,
		OldConfigureForAzure:  configureForAzure,
		srv:                   srv,
		router:                r,
	}
}

func (gwtest *Test) MockEC2() *mockec2.Metadata {
	mockec2 := mockec2.New(&gwtest.Config.PublicConfig, "test-provider", nil)
	mockec2.RegisterService(gwtest.router)
	gwtest.Provider = AWS_PROVIDER
	EC2MetadataBaseURL = "http://localhost:13243/latest"
	configureForAWS = true
	return mockec2
}

func (gwtest *Test) Setup() error {
	configFile := &gwconfig.File{
		Path: filepath.Join(testdataDir, gwtest.t.Name(), "generic-worker.config"),
	}
	if gwtest.Provider == NO_PROVIDER {
		err := configFile.Persist(gwtest.Config)
		if err != nil {
			gwtest.t.Fatalf("Could not persist config file: %v", err)
		}
	}
	var err error
	configProvider, err = loadConfig(configFile, gwtest.Provider)
	return err
}

func (gwtest *Test) Teardown() {
	internalPUTPort = gwtest.OldInternalPUTPort
	internalGETPort = gwtest.OldInternalGETPort
	EC2MetadataBaseURL = gwtest.OldEC2MetadataBaseURL
	configureForAWS = gwtest.OldConfigureForAWS
	configureForGCP = gwtest.OldConfigureForGCP
	configureForAzure = gwtest.OldConfigureForAzure
	gwtest.t.Logf("Removing test directory %v...", filepath.Join(testdataDir, gwtest.t.Name()))
	err := os.RemoveAll(filepath.Join(testdataDir, gwtest.t.Name()))
	if err != nil {
		gwtest.t.Logf("WARNING: Not able to clean up after test: %v", err)
	}
	taskContext = nil
	globalTestName = ""
	config = nil
	// gwtest.srv nil if no services
	if gwtest.srv != nil {
		err = gwtest.srv.Shutdown(context.Background())
		if err != nil {
			gwtest.t.Fatalf("Error shutting down http server: %v", err)
		}
		gwtest.t.Log("Mock HTTP services stopped")
	}
}
