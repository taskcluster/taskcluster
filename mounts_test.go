package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"os"
	"path/filepath"
	"testing"

	"github.com/taskcluster/taskcluster-client-go/queue"
)

func TestMounts(t *testing.T) {

	creds := requireTaskClusterCredentials(t)

	cwd, err := os.Getwd()
	if err != nil {
		t.Fatal("Cannot establish current working directory")
	}
	config = &Config{
		CachesDir:    filepath.Join(cwd, "caches"),
		DownloadsDir: filepath.Join(cwd, "downloads"),
	}
	TaskUser.HomeDir = filepath.Join(cwd, "testdata")

	// clear any data from previous runs...
	for _, dir := range []string{
		"my-task-caches",
		"preloaded",
	} {
		err := ensureEmptyDir(filepath.Join(TaskUser.HomeDir, dir))
		if err != nil {
			t.Fatalf("Could not delete contents of directory %q", filepath.Join(TaskUser.HomeDir, dir))
		}
	}

	Queue = queue.New(creds)
	mf := MountsFeature{}
	mf.Initialise()

	mounts := []MountEntry{

		// file mount from artifact
		&FileMount{
			File: filepath.Join("preloaded", "Mr X.txt"),
			Content: Content(`{
				"taskId":   "KTBKfEgxR5GdfIIREQIvFQ",
				"artifact": "SampleArtifacts/_/X.txt"
			}`),
		},

		// file mount from url
		&FileMount{
			File: filepath.Join("preloaded", "some-audio.sh"),
			Content: Content(`{
				"url": "https://raw.githubusercontent.com/taskcluster/generic-worker/9e7ee7638f7d27ccf37ef0d5ca119ede106c73ca/tutorial-audio.sh"
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

	b, err := json.Marshal(&mounts)
	if err != nil {
		t.Fatalf("Could not convert MountEntries to json")
	}

	mountEntries := []json.RawMessage{}
	err = json.Unmarshal(b, &mountEntries)
	if err != nil {
		t.Fatalf("Could not convert json bytes to []json.RawMessage")
	}

	task := &TaskRun{
		Payload: GenericWorkerPayload{
			Mounts: mountEntries,
		},
	}
	tf := mf.NewTaskFeature(task).(*TaskMount)
	if tf.payloadError != nil {
		t.Logf("ERROR: %v", tf.payloadError)
	}
	reqScopes := tf.RequiredScopes()
	actualRequiredScopes := fmt.Sprintf("%v", [][]string(reqScopes))
	expectedRequiredScopes :=
		"[[" +
			"queue:get-artifact:SampleArtifacts/_/X.txt" +
			" generic-worker:cache:banana-cache" +
			" generic-worker:cache:tomato-cache" +
			" generic-worker:cache:devtools-app" +
			"]]"
	if actualRequiredScopes != expectedRequiredScopes {
		t.Fatalf("Expected required scopes %q but got %q", expectedRequiredScopes, actualRequiredScopes)
	}
	err = tf.Start()
	if err != nil {
		t.Fatalf("Encountered error when starting mounts feature for task: %v", err)
	}

	// check a sample of the files that should should have been extracted...
	checkSHA256(
		t,
		"d75c26a5bb47c4786ef15819d894e0e4e61829ee177b941e25b46f0de66d8148",
		filepath.Join("testdata", "my-task-caches", "devtools-app", "index.html"),
	)
	checkSHA256(
		t,
		"29d3f3c2822c48770bc77dfd9965bec4676c9902f182796eac6fac5c986540e0",
		filepath.Join("testdata", "my-task-caches", "mozharness", "mozharness", "configs", "beetmover", "l10n_changesets.tmpl"),
	)
	checkSHA256(
		t,
		"5d6977130018253e9c655e95b4abeb4f6f7c1deac989032b22a77a6a2f5605bc",
		filepath.Join("testdata", "my-task-caches", "mozharness", "mozharness", "configs", "builds", "releng_sub_linux_configs", "32_debug.py"),
	)
	checkSHA256(
		t,
		"7cacc851d921716497bbd3d35134fa8ab34e6c5ae072954fae89b20f2977fc44",
		filepath.Join("testdata", "my-task-caches", "tomatoes", "mozharness", "docs", "gaia_integration.rst"),
	)
	checkSHA256(
		t,
		"4bb5b3476d844fa4d27fcff48bc8b24990f907e68637dab5abfe1d8d72ccd6f0",
		filepath.Join("testdata", "my-task-caches", "tomatoes", "mozharness", "unit.sh"),
	)

	// alter a cache by adding a file...
	err = ioutil.WriteFile(filepath.Join("testdata", "my-task-caches", "devtools-app", "foo.bar"), []byte("dummy file"), 0666)
	if err != nil {
		t.Fatalf("Could not create file foo.bat in devtools-app cache")
	}

	err = tf.Stop()
	if err != nil {
		t.Fatalf("Encountered error when stopping mounts feature for task: %v", err)
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
		"e2f4c7554a5ef2992da54b122e7383d2d4531aaa54ae3ea5794631e53532e79c",
		fileCaches["urlcontent:https://raw.githubusercontent.com/taskcluster/generic-worker/9e7ee7638f7d27ccf37ef0d5ca119ede106c73ca/tutorial-audio.sh"].Location,
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
