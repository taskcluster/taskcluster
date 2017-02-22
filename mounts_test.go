package main

import (
	"encoding/json"
	"io/ioutil"
	"path/filepath"
	"strings"
	"testing"
)

func toMountArray(t *testing.T, x interface{}) []Mount {
	b, err := json.Marshal(x)
	if err != nil {
		t.Fatalf("Could not convert %v to json", x)
	}

	rawMessageArray := []Mount{}
	err = json.Unmarshal(b, &rawMessageArray)
	if err != nil {
		t.Fatalf("Could not convert json bytes to []json.RawMessage")
	}
	return rawMessageArray
}

func TestMounts(t *testing.T) {

	setup(t)

	mounts := []MountEntry{

		// file mount from artifact
		&FileMount{
			File: filepath.Join("preloaded", "Mr X.txt"),
			Content: Content(`{
				"taskId":   "KTBKfEgxR5GdfIIREQIvFQ",
				"artifact": "SampleArtifacts/_/X.txt"
			}`),
		},

		// file mounts from urls
		&FileMount{
			File: filepath.Join("preloaded", "check-shasums.sh"),
			Content: Content(`{
				"url": "https://raw.githubusercontent.com/taskcluster/testrepo/master/generic-worker/check-shasums.sh"
			}`),
		},
		&FileMount{
			File: filepath.Join("preloaded", "check-shasums.ps1"),
			Content: Content(`{
				"url": "https://raw.githubusercontent.com/taskcluster/testrepo/master/generic-worker/check-shasums.ps1"
			}`),
		},
		&FileMount{
			File: filepath.Join("preloaded", "shasums"),
			Content: Content(`{
				"url": "https://raw.githubusercontent.com/taskcluster/testrepo/master/generic-worker/shasums"
			}`),
		},

		// empty writable directory cache
		&WritableDirectoryCache{
			CacheName: "banana-cache",
			Directory: filepath.Join("my-task-caches", "bananas"),
		},

		// pre-loaded writable directory cache from artifact
		&WritableDirectoryCache{
			CacheName: "tomato-cache",
			Directory: filepath.Join("my-task-caches", "tomatoes"),
			Content: Content(`{
				"taskId":   "To_4IZUgRgOrmR2w6UTerA",
				"artifact": "public/build/mozharness.zip"
			}`),
			Format: "zip",
		},

		// pre-loaded writable directory cache from url
		&WritableDirectoryCache{
			CacheName: "devtools-app",
			Directory: filepath.Join("my-task-caches", "devtools-app"),
			Content: Content(`{
				"url": "https://github.com/mozilla/gecko-dev/raw/233f30f2377f3df0f3388721901681f432b813fb/devtools/client/webide/test/app.zip"
			}`),
			Format: "zip",
		},

		// read only directory from artifact
		&ReadOnlyDirectory{
			Directory: filepath.Join("my-task-caches", "mozharness"),
			Content: Content(`{
				"taskId":   "OpqCz--JTlCYFq_bu3489A",
				"artifact": "public/build/mozharness.zip"
			}`),
			Format: "zip",
		},

		// read only directory from url
		&ReadOnlyDirectory{
			Directory: filepath.Join("my-task-caches", "package"),
			Content: Content(`{
				"url": "https://github.com/taskcluster/logserver/raw/53134a5b9cbece05752c0ecc1a6c6d7c2fbf6580/node_modules/express/node_modules/connect/node_modules/multiparty/test/fixture/file/binaryfile.tar.gz"
			}`),
			Format: "tar.gz",
		},
	}

	payload := GenericWorkerPayload{
		Mounts:     toMountArray(t, &mounts),
		Command:    checkSHASums(),
		MaxRunTime: 180,
	}

	td := testTask()
	td.Scopes = []string{
		"queue:get-artifact:SampleArtifacts/_/X.txt",
		"generic-worker:cache:banana-cache",
		"generic-worker:cache:tomato-cache",
		"generic-worker:cache:devtools-app",
	}

	taskID, myQueue := submitTask(t, td, payload)
	runWorker()

	// check task succeeded
	tsr, err := myQueue.Status(taskID)
	if err != nil {
		t.Fatalf("Problem querying status of task %v: %v", taskID, err)
	}
	if tsr.Status.State != "completed" {
		t.Fatalf("Task %v did not complete successfully - it has state %q but should have state \"completed\"", taskID, tsr.Status.State)
	}

	checkSHA256(
		t,
		"51477c657887ebd351a0d9dd9bb914c7ada9b34222745b9c030a3c13bde90b9f",
		fileCaches["artifact:OpqCz--JTlCYFq_bu3489A:public/build/mozharness.zip"].Location,
	)
	checkSHA256(
		t,
		"c075e31488502350611e9ff5740d405cc5c190f03996b26c1f47b2ec68bd14ac",
		fileCaches["urlcontent:https://github.com/taskcluster/logserver/raw/53134a5b9cbece05752c0ecc1a6c6d7c2fbf6580/node_modules/express/node_modules/connect/node_modules/multiparty/test/fixture/file/binaryfile.tar.gz"].Location,
	)
	checkSHA256(
		t,
		"8308d593eb56527137532595a60255a3fcfbe4b6b068e29b22d99742bad80f6f",
		fileCaches["artifact:KTBKfEgxR5GdfIIREQIvFQ:SampleArtifacts/_/X.txt"].Location,
	)
	checkSHA256(
		t,
		"8da97cd31517c99029c8d2bc69e276f8a0d96e6ce9409dab819b8be19114c44d",
		fileCaches["urlcontent:https://raw.githubusercontent.com/taskcluster/testrepo/master/generic-worker/check-shasums.sh"].Location,
	)
	checkSHA256(
		t,
		"800683ad3faff0d4f4ecb07d31c1ad1f229615835b6da6be2dabf633d844574b",
		fileCaches["artifact:To_4IZUgRgOrmR2w6UTerA:public/build/mozharness.zip"].Location,
	)
	checkSHA256(
		t,
		"941a2c5ae826b314f289642df6ea3a8e320d66ca669fc3579abc7be9b0a50271",
		fileCaches["urlcontent:https://github.com/mozilla/gecko-dev/raw/233f30f2377f3df0f3388721901681f432b813fb/devtools/client/webide/test/app.zip"].Location,
	)

	// now check the file we added to the cache...
	checkSHA256(
		t,
		"51d818981374a447f0876610fd2baeeb911dd5ad60c6e6b4d2b6b6798ba5c071",
		filepath.Join(directoryCaches["devtools-app"].Location, "foo.bar"),
	)
}

func TestMissingScopes(t *testing.T) {
	setup(t)
	mounts := []MountEntry{
		// requires scope "queue:get-artifact:SampleArtifacts/_/X.txt"
		&FileMount{
			File: filepath.Join("preloaded", "Mr X.txt"),
			Content: Content(`{
				"taskId":   "KTBKfEgxR5GdfIIREQIvFQ",
				"artifact": "SampleArtifacts/_/X.txt"
			}`),
		},
		// requires scope "generic-worker:cache:banana-cache"
		&WritableDirectoryCache{
			CacheName: "banana-cache",
			Directory: filepath.Join("my-task-caches", "bananas"),
		},
	}

	payload := GenericWorkerPayload{
		Mounts:     toMountArray(t, &mounts),
		Command:    helloGoodbye(),
		MaxRunTime: 180,
	}

	td := testTask()
	// don't set any scopes

	taskID, myQueue := submitTask(t, td, payload)
	runWorker()

	// check task had exception/malformed-payload
	tsr, err := myQueue.Status(taskID)
	if err != nil {
		t.Fatalf("Problem querying status of task %v: %v", taskID, err)
	}
	if tsr.Status.State != "exception" || tsr.Status.Runs[0].ReasonResolved != "malformed-payload" {
		t.Fatalf("Task %v did not complete as intended - it resolved as %v/%v but should have resolved as exception/malformed-payload", taskID, tsr.Status.State, tsr.Status.Runs[0].ReasonResolved)
	}

	// check log mentions both missing scopes
	bytes, err := ioutil.ReadFile(filepath.Join(taskContext.TaskDir, "public", "logs", "live_backing.log"))
	if err != nil {
		t.Fatalf("Error when trying to read log file: %v", err)
	}
	logtext := string(bytes)
	if !strings.Contains(logtext, "queue:get-artifact:SampleArtifacts/_/X.txt") || !strings.Contains(logtext, "generic-worker:cache:banana-cache") {
		t.Fatalf("Was expecting log file to contain missing scopes, but it doesn't")
	}
}

func TestCachesCanBeModified(t *testing.T) {
	setup(t)
	// We're going to run three consecutive tasks here. The first will create
	// a file called `counter` in the cache and the contents of the file will
	// be `1`. The next task will overwrite this file with the number `2`. The
	// third task will overwrite the file with the number `3`. Then we check
	// the file `counter` has the number `3` as its contents.
	config.NumberOfTasksToRun = 3

	mounts := []MountEntry{
		&WritableDirectoryCache{
			CacheName: "test-modifications",
			Directory: filepath.Join("my-task-caches", "test-modifications"),
		},
	}

	payload := GenericWorkerPayload{
		Mounts:     toMountArray(t, &mounts),
		Command:    incrementCounterInCache(),
		MaxRunTime: 20,
	}

	for i := 0; i < 3; i++ {
		td := testTask()
		td.Scopes = []string{"generic-worker:cache:test-modifications"}
		submitTask(t, td, payload)
	}
	runWorker()

	counterFile := filepath.Join(directoryCaches["test-modifications"].Location, "counter")
	bytes, err := ioutil.ReadFile(counterFile)
	if err != nil {
		t.Fatalf("Error when trying to read cache file: %v", err)
	}
	if string(bytes) != "3" {
		t.Fatalf("Was expecting file %v to have content %q but had %q", counterFile, "3", string(bytes))
	}
}

func Test32BitOverflow(t *testing.T) {
	config = &Config{
		RequiredDiskSpaceMegabytes: 1024 * 10,
	}
	if requiredFreeSpace := requiredSpaceBytes(); requiredFreeSpace != 10737418240 {
		t.Fatalf("Some kind of int overflow problem: requiredFreeSpace is %v but expected it to be 10737418240", requiredFreeSpace)
	}
}
