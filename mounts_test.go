package main

import (
	"encoding/json"
	"io/ioutil"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/taskcluster/generic-worker/gwconfig"
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

	setup(t, "TestMounts")
	defer teardown(t)

	mounts := []MountEntry{

		// file mount from artifact
		&FileMount{
			File: filepath.Join("preloaded", "Mr X.txt"),
			// Note: the task definition for taskId KTBKfEgxR5GdfIIREQIvFQ can be seen in the testdata/tasks directory
			Content: Content(`{
				"taskId":   "KTBKfEgxR5GdfIIREQIvFQ",
				"artifact": "SampleArtifacts/_/X.txt"
			}`),
		},

		// file mounts from urls
		&FileMount{
			File: filepath.Join("preloaded", "check-shasums.sh"),
			Content: Content(`{
				"url": "https://raw.githubusercontent.com/taskcluster/testrepo/db12070fc7ea6e5d21797bf943c0b9466fb4d65e/generic-worker/check-shasums.sh"
			}`),
		},
		&FileMount{
			File: filepath.Join("preloaded", "check-shasums.ps1"),
			Content: Content(`{
				"url": "https://raw.githubusercontent.com/taskcluster/testrepo/db12070fc7ea6e5d21797bf943c0b9466fb4d65e/generic-worker/check-shasums.ps1"
			}`),
		},
		&FileMount{
			File: filepath.Join("preloaded", "shasums"),
			Content: Content(`{
				"url": "https://raw.githubusercontent.com/taskcluster/testrepo/db12070fc7ea6e5d21797bf943c0b9466fb4d65e/generic-worker/shasums"
			}`),
		},

		// empty writable directory cache
		&WritableDirectoryCache{
			CacheName: "banana-cache",
			Directory: filepath.Join("my-task-caches", "bananas"),
		},

		// pre-loaded writable directory cache from artifact
		&WritableDirectoryCache{
			CacheName: "unknown-issuer-app-cache",
			Directory: filepath.Join("my-task-caches", "unknown_issuer_app_1"),
			// Note: the task definition for taskId LK1Rz2UtT16d-HBSqyCtuA can be seen in the testdata/tasks directory
			Content: Content(`{
				"taskId":   "LK1Rz2UtT16d-HBSqyCtuA",
				"artifact": "public/build/unknown_issuer_app_1.zip"
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
			// Note: the task definition for taskId VESwp9JaRo-XkFN_bemBhw can be seen in the testdata/tasks directory
			Content: Content(`{
				"taskId":   "VESwp9JaRo-XkFN_bemBhw",
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

	td := testTask(t)
	td.Scopes = []string{
		"queue:get-artifact:SampleArtifacts/_/X.txt",
		"generic-worker:cache:banana-cache",
		"generic-worker:cache:unknown-issuer-app-cache",
		"generic-worker:cache:devtools-app",
	}

	taskID := scheduleAndExecute(t, td, payload)

	// check task succeeded
	ensureResolution(t, taskID, "completed", "completed")

	checkSHA256(
		t,
		"625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e",
		// Note: the task definition for taskId LK1Rz2UtT16d-HBSqyCtuA can be seen in the testdata/tasks directory
		fileCaches["artifact:LK1Rz2UtT16d-HBSqyCtuA:public/build/unknown_issuer_app_1.zip"].Location,
	)
	checkSHA256(
		t,
		"c075e31488502350611e9ff5740d405cc5c190f03996b26c1f47b2ec68bd14ac",
		fileCaches["urlcontent:https://github.com/taskcluster/logserver/raw/53134a5b9cbece05752c0ecc1a6c6d7c2fbf6580/node_modules/express/node_modules/connect/node_modules/multiparty/test/fixture/file/binaryfile.tar.gz"].Location,
	)
	checkSHA256(
		t,
		"8308d593eb56527137532595a60255a3fcfbe4b6b068e29b22d99742bad80f6f",
		// Note: the task definition for taskId KTBKfEgxR5GdfIIREQIvFQ can be seen in the testdata/tasks directory
		fileCaches["artifact:KTBKfEgxR5GdfIIREQIvFQ:SampleArtifacts/_/X.txt"].Location,
	)
	checkSHA256(
		t,
		"96f72a068ed0aa4db440f5dc49379d6567b1e6c0c5bac44dc905745639c4314b",
		fileCaches["urlcontent:https://raw.githubusercontent.com/taskcluster/testrepo/db12070fc7ea6e5d21797bf943c0b9466fb4d65e/generic-worker/check-shasums.sh"].Location,
	)
	checkSHA256(
		t,
		"613193e90dcba442ffa01622834387bb5f175fdc67c46f564284261076994a75",
		// Note: the task definition for taskId VESwp9JaRo-XkFN_bemBhw can be seen in the testdata/tasks directory
		fileCaches["artifact:VESwp9JaRo-XkFN_bemBhw:public/build/mozharness.zip"].Location,
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
	setup(t, "TestMissingScopes")
	defer teardown(t)
	mounts := []MountEntry{
		// requires scope "queue:get-artifact:SampleArtifacts/_/X.txt"
		&FileMount{
			File: filepath.Join("preloaded", "Mr X.txt"),
			// Note: the task definition for taskId KTBKfEgxR5GdfIIREQIvFQ can be seen in the testdata/tasks directory
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

	td := testTask(t)
	// don't set any scopes

	taskID := scheduleAndExecute(t, td, payload)

	ensureResolution(t, taskID, "exception", "malformed-payload")

	// check log mentions both missing scopes
	bytes, err := ioutil.ReadFile(filepath.Join(taskContext.TaskDir, livelogPath))
	if err != nil {
		t.Fatalf("Error when trying to read log file: %v", err)
	}
	logtext := string(bytes)
	if !strings.Contains(logtext, "queue:get-artifact:SampleArtifacts/_/X.txt") || !strings.Contains(logtext, "generic-worker:cache:banana-cache") {
		t.Fatalf("Was expecting log file to contain missing scopes, but it doesn't")
	}
}

func TestCachesCanBeModified(t *testing.T) {
	setup(t, "TestCachesCanBeModified")
	defer teardown(t)
	// We're going to run three consecutive tasks here. The first will create
	// a file called `counter` in the cache and the contents of the file will
	// be `1`. The next task will overwrite this file with the number `2`. The
	// third task will overwrite the file with the number `3`. Then we check
	// the file `counter` has the number `3` as its contents.

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

	execute := func() {
		td := testTask(t)
		td.Scopes = []string{"generic-worker:cache:test-modifications"}
		scheduleAndExecute(t, td, payload)
	}

	getCounter := func() int {
		counterFile := filepath.Join(directoryCaches["test-modifications"].Location, "counter")
		bytes, err := ioutil.ReadFile(counterFile)
		if err != nil {
			t.Fatalf("Error when trying to read cache file: %v", err)
		}
		val, err := strconv.Atoi(string(bytes))
		if err != nil {
			t.Fatalf("Error reading int value from counter file")
		}
		return val
	}

	execute()
	startCounter := getCounter()

	execute()
	execute()
	endCounter := getCounter()

	if endCounter != startCounter+2 {
		t.Fatalf("Was expecting counter to have value %v but had %v", startCounter+2, endCounter)
	}
}

func Test32BitOverflow(t *testing.T) {
	config = &gwconfig.Config{
		RequiredDiskSpaceMegabytes: 1024 * 10,
	}
	if requiredFreeSpace := requiredSpaceBytes(); requiredFreeSpace != 10737418240 {
		t.Fatalf("Some kind of int overflow problem: requiredFreeSpace is %v but expected it to be 10737418240", requiredFreeSpace)
	}
}

func TestCorruptZipDoesntCrashWorker(t *testing.T) {
	setup(t, "TestCorruptZipDoesntCrashWorker")
	defer teardown(t)
	mounts := []MountEntry{
		// requires scope "queue:get-artifact:SampleArtifacts/_/X.txt"
		&ReadOnlyDirectory{
			Directory: filepath.Join("."),
			// Note: the task definition for taskId KTBKfEgxR5GdfIIREQIvFQ can be seen in the testdata/tasks directory
			Content: Content(`{
				"taskId":   "KTBKfEgxR5GdfIIREQIvFQ",
				"artifact": "SampleArtifacts/_/X.txt"
			}`),
			Format: "zip",
		},
	}

	payload := GenericWorkerPayload{
		Mounts:     toMountArray(t, &mounts),
		Command:    helloGoodbye(),
		MaxRunTime: 180,
	}

	td := testTask(t)
	td.Scopes = []string{"queue:get-artifact:SampleArtifacts/_/X.txt"}

	taskID := scheduleAndExecute(t, td, payload)

	ensureResolution(t, taskID, "failed", "failed")

	// check log mentions zip file is invalid
	bytes, err := ioutil.ReadFile(filepath.Join(taskContext.TaskDir, livelogPath))
	if err != nil {
		t.Fatalf("Error when trying to read log file: %v", err)
	}
	logtext := string(bytes)
	if !strings.Contains(logtext, "zip: not a valid zip file") {
		t.Fatalf("Was expecting log file to contain a zip error message, but it instead contains:\n%v", logtext)
	}
}
