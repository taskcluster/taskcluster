// +build !docker

package main

import (
	"encoding/json"
	"io/ioutil"
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

func TestMounts(t *testing.T) {

	defer setup(t)()

	mounts := []MountEntry{

		// file mount from artifact
		&FileMount{
			File: filepath.Join("preloaded", "Mr X.txt"),
			// Note: the task definition for taskId KTBKfEgxR5GdfIIREQIvFQ can be seen in the testdata/tasks directory
			Content: json.RawMessage(`{
				"taskId":   "KTBKfEgxR5GdfIIREQIvFQ",
				"artifact": "SampleArtifacts/_/X.txt"
			}`),
		},

		// file mounts from urls
		&FileMount{
			File: filepath.Join("preloaded", "check-shasums.sh"),
			Content: json.RawMessage(`{
				"url": "https://raw.githubusercontent.com/taskcluster/testrepo/db12070fc7ea6e5d21797bf943c0b9466fb4d65e/generic-worker/check-shasums.sh"
			}`),
		},
		&FileMount{
			File: filepath.Join("preloaded", "check-shasums.ps1"),
			Content: json.RawMessage(`{
				"url": "https://raw.githubusercontent.com/taskcluster/testrepo/db12070fc7ea6e5d21797bf943c0b9466fb4d65e/generic-worker/check-shasums.ps1"
			}`),
		},
		&FileMount{
			File: filepath.Join("preloaded", "shasums"),
			Content: json.RawMessage(`{
				"url": "https://raw.githubusercontent.com/taskcluster/testrepo/db12070fc7ea6e5d21797bf943c0b9466fb4d65e/generic-worker/shasums"
			}`),
		},

		//file mount from raw
		&FileMount{
			File: filepath.Join("preloaded", "raw.txt"),
			Content: json.RawMessage(`{
				"raw": "Hello Raw!"
			}`),
		},

		//file mount from base64
		&FileMount{
			File: filepath.Join("preloaded", "base64"),
			Content: json.RawMessage(`{
				"base64": "ZWNobyAnSGVsbG8gQmFzZTY0IScK"
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
			Content: json.RawMessage(`{
				"taskId":   "LK1Rz2UtT16d-HBSqyCtuA",
				"artifact": "public/build/unknown_issuer_app_1.zip"
			}`),
			Format: "zip",
		},

		// pre-loaded writable directory cache from url
		&WritableDirectoryCache{
			CacheName: "devtools-app",
			Directory: filepath.Join("my-task-caches", "devtools-app"),
			Content: json.RawMessage(`{
				"url": "https://github.com/mozilla/gecko-dev/raw/233f30f2377f3df0f3388721901681f432b813fb/devtools/client/webide/test/app.zip"
			}`),
			Format: "zip",
		},

		// read only directory from artifact
		&ReadOnlyDirectory{
			Directory: filepath.Join("my-task-caches", "mozharness"),
			// Note: the task definition for taskId VESwp9JaRo-XkFN_bemBhw can be seen in the testdata/tasks directory
			Content: json.RawMessage(`{
				"taskId":   "VESwp9JaRo-XkFN_bemBhw",
				"artifact": "public/build/mozharness.zip"
			}`),
			Format: "zip",
		},

		// read only directory from url
		&ReadOnlyDirectory{
			Directory: filepath.Join("my-task-caches", "package"),
			Content: json.RawMessage(`{
				"url": "https://github.com/taskcluster/logserver/raw/53134a5b9cbece05752c0ecc1a6c6d7c2fbf6580/node_modules/express/node_modules/connect/node_modules/multiparty/test/fixture/file/binaryfile.tar.gz"
			}`),
			Format: "tar.gz",
		},
	}

	payload := GenericWorkerPayload{
		Mounts: toMountArray(t, &mounts),
		// since this checks that SHA values of files as the task user, is also ensures they are readable by task user
		Command: checkSHASums(),
		// Don't assume powershell is in the default system PATH, but rather
		// require that powershell is in the PATH of the test process.
		Env: map[string]string{
			"PATH": os.Getenv("PATH"),
		},
		MaxRunTime: 180,
	}

	td := testTask(t)
	td.Dependencies = []string{
		"KTBKfEgxR5GdfIIREQIvFQ",
		"LK1Rz2UtT16d-HBSqyCtuA",
		"VESwp9JaRo-XkFN_bemBhw",
	}
	td.Scopes = []string{
		"queue:get-artifact:SampleArtifacts/_/X.txt",
		"generic-worker:cache:banana-cache",
		"generic-worker:cache:unknown-issuer-app-cache",
		"generic-worker:cache:devtools-app",
	}

	// check task succeeded
	_ = submitAndAssert(t, td, payload, "completed", "completed")

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

func TestCachesCanBeModified(t *testing.T) {
	defer setup(t)()
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
		_ = submitAndAssert(t, td, payload, "completed", "completed")
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

// TestCacheMoved tests that if a test mounts a cache, and then moves it to a
// different location, that the test fails, and the worker doesn't crash.
func TestCacheMoved(t *testing.T) {

	// whether permission is granted to task user depends if running under windows or not
	// and is independent of whether running as current user or not
	granting, _ := grantingDenying(t, "directory", t.Name())

	// No cache on first pass
	pass1 := append([]string{
		`No existing writable directory cache 'banana-cache' - creating .*`,
		`Downloading task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip to .*`,
		`Downloaded 4220 bytes with SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e from task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip to .*`,
		`Content from task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip \(.*\) matches required SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e`,
		`Creating directory .*` + t.Name() + ` with permissions 0700`,
		`Extracting zip file .* to '.*` + t.Name() + `'`,
	},
		granting...,
	)
	pass1 = append(pass1,
		`Successfully mounted writable directory cache '.*`+t.Name()+`'`,
		`Preserving cache: Moving ".*`+t.Name()+`" to ".*"`,
		`Removing cache banana-cache from cache table`,
		`Deleting cache banana-cache file\(s\) at .*`,
		`Could not unmount task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip due to: 'Could not persist cache "banana-cache" due to .*'`,
	)

	// On second pass, cache already exists
	pass2 := append([]string{
		`No existing writable directory cache 'banana-cache' - creating .*`,
		`Found existing download for artifact:LK1Rz2UtT16d-HBSqyCtuA:public/build/unknown_issuer_app_1.zip \(.*\) with correct SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e`,
		`Creating directory .*` + t.Name() + ` with permissions 0700`,
		`Extracting zip file .* to '.*` + t.Name() + `'`,
	},
		granting...,
	)
	pass2 = append(pass2,
		`Successfully mounted writable directory cache '.*`+t.Name()+`'`,
		`Preserving cache: Moving ".*`+t.Name()+`" to ".*"`,
		`Removing cache banana-cache from cache table`,
		`Deleting cache banana-cache file\(s\) at .*`,
		`Could not unmount task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip due to: 'Could not persist cache "banana-cache" due to .*'`,
	)

	LogTest(
		&MountsLoggingTestCase{
			Test: t,
			Mounts: []MountEntry{
				&WritableDirectoryCache{
					CacheName: "banana-cache",
					Directory: t.Name(),
					// Note: the task definition for taskId LK1Rz2UtT16d-HBSqyCtuA can be seen in the testdata/tasks directory
					Content: json.RawMessage(`{
						"taskId": "LK1Rz2UtT16d-HBSqyCtuA",
						"artifact": "public/build/unknown_issuer_app_1.zip",
						"sha256": "625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e"
					}`),
					Format: "zip",
				},
			},
			Dependencies: []string{
				"LK1Rz2UtT16d-HBSqyCtuA",
			},
			Scopes: []string{"generic-worker:cache:banana-cache"},
			Payload: &GenericWorkerPayload{
				Command:    goRun("move-file.go", t.Name(), "MovedCache"),
				MaxRunTime: 180,
			},
			TaskRunResolutionState: "failed",
			TaskRunReasonResolved:  "failed",
			PerTaskRunLogExcerpts: [][]string{
				// Required text from first task with no cached value
				pass1,
				// Required text from second task when download is already cached
				pass2,
			},
		},
	)

}

func TestMountFileAndDirSameLocation(t *testing.T) {

	// whether permission is granted to task user depends if running under windows or not
	// and is independent of whether running as current user or not
	granting, _ := grantingDenying(t, "file", "file-located-here")

	// No cache on first pass
	pass1 := append([]string{
		`Downloading task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip to .*`,
		`Downloaded 4220 bytes with SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e from task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip to .*`,
		`Download .* of task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip has SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e but task payload does not declare a required value, so content authenticity cannot be verified`,
		`Creating directory .* with permissions 0700`,
		`Copying .* to .*file-located-here`,
	},
		granting...,
	)

	pass1 = append(pass1,
		`Found existing download for artifact:LK1Rz2UtT16d-HBSqyCtuA:public/build/unknown_issuer_app_1.zip \(.*\) with correct SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e`,
		`Creating directory .*file-located-here with permissions 0700`,
		// error is platform specific
		`(mkdir .*file-located-here: not a directory|mkdir .*file-located-here: The system cannot find the path specified.|Cannot create directory .*file-located-here)`,
	)

	// On second pass, cache already exists
	pass2 := append([]string{
		`No SHA256 specified in task mounts for artifact:LK1Rz2UtT16d-HBSqyCtuA:public/build/unknown_issuer_app_1.zip - SHA256 from downloaded file .* is 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e.`,
		`Creating directory .* with permissions 0700`,
		`Copying .* to .*file-located-here`,
	},
		granting...,
	)

	pass2 = append(pass2,
		`Found existing download for artifact:LK1Rz2UtT16d-HBSqyCtuA:public/build/unknown_issuer_app_1.zip \(.*\) with correct SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e`,
		`Creating directory .*file-located-here with permissions 0700`,
		// error is platform specific
		`(mkdir .*file-located-here: not a directory|mkdir .*file-located-here: The system cannot find the path specified.|Cannot create directory .*file-located-here)`,
	)

	LogTest(
		&MountsLoggingTestCase{
			Test: t,
			Mounts: []MountEntry{
				&FileMount{
					File: "file-located-here",
					// Note: the task definition for taskId LK1Rz2UtT16d-HBSqyCtuA can be seen in the testdata/tasks directory
					Content: json.RawMessage(`{
						"taskId":   "LK1Rz2UtT16d-HBSqyCtuA",
						"artifact": "public/build/unknown_issuer_app_1.zip"
					}`),
				},
				&ReadOnlyDirectory{
					Directory: "file-located-here",
					// Note: the task definition for taskId LK1Rz2UtT16d-HBSqyCtuA can be seen in the testdata/tasks directory
					Content: json.RawMessage(`{
						"taskId":   "LK1Rz2UtT16d-HBSqyCtuA",
						"artifact": "public/build/unknown_issuer_app_1.zip",
						"sha256":   "625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e"
					}`),
					Format: "zip",
				},
			},
			Dependencies: []string{
				"LK1Rz2UtT16d-HBSqyCtuA",
			},
			TaskRunResolutionState: "failed",
			TaskRunReasonResolved:  "failed",
			PerTaskRunLogExcerpts: [][]string{
				// Required text from first task with no cached value
				pass1,
				// Required text from second task when download is already cached
				pass2,
			},
		},
	)
}

func TestInvalidSHADoesNotPreventMountedMountsFromBeingUnmounted(t *testing.T) {

	defer setup(t)()

	mounts := []MountEntry{
		&WritableDirectoryCache{
			CacheName: "unknown-issuer-app-cache",
			Directory: filepath.Join(t.Name(), "1"),
		},
		&ReadOnlyDirectory{
			Directory: filepath.Join(t.Name(), "2"),
			// Note: the task definition for taskId LK1Rz2UtT16d-HBSqyCtuA can be seen in the testdata/tasks directory
			// SHA256 is intentionally incorrect to make sure that above cache is still persisted
			Content: json.RawMessage(`{
				"taskId": "LK1Rz2UtT16d-HBSqyCtuA",
				"artifact": "public/build/unknown_issuer_app_1.zip",
				"sha256": "7777777777777777777777777777777777777777777777777777777777777777"
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
	td.Dependencies = []string{
		"LK1Rz2UtT16d-HBSqyCtuA",
	}
	td.Scopes = []string{
		"generic-worker:cache:unknown-issuer-app-cache",
	}

	// check task failed due to bad SHA256
	_ = submitAndAssert(t, td, payload, "failed", "failed")

	mounts = []MountEntry{
		&WritableDirectoryCache{
			CacheName: "unknown-issuer-app-cache",
			Directory: filepath.Join(t.Name(), "1"),
		},
	}

	payload = GenericWorkerPayload{
		Mounts:     toMountArray(t, &mounts),
		Command:    helloGoodbye(),
		MaxRunTime: 180,
	}

	td = testTask(t)
	td.Scopes = []string{
		"generic-worker:cache:unknown-issuer-app-cache",
	}

	// check task succeeded, and worker didn't crash when trying to mount cache
	// (which can happen if it wasn't unmounted after first task failed)
	_ = submitAndAssert(t, td, payload, "completed", "completed")
}
