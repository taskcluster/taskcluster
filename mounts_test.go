package main

import (
	"encoding/json"
	"io/ioutil"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/taskcluster/generic-worker/gwconfig"
)

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

func TestMounts(t *testing.T) {

	defer setup(t, "TestMounts")()

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

func TestMissingScopes(t *testing.T) {
	defer setup(t, "TestMissingScopes")()
	mounts := []MountEntry{
		// requires scope "queue:get-artifact:SampleArtifacts/_/X.txt"
		&FileMount{
			File: filepath.Join("preloaded", "Mr X.txt"),
			// Note: the task definition for taskId KTBKfEgxR5GdfIIREQIvFQ can be seen in the testdata/tasks directory
			Content: json.RawMessage(`{
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

	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")

	// check log mentions both missing scopes
	bytes, err := ioutil.ReadFile(filepath.Join(taskContext.TaskDir, logPath))
	if err != nil {
		t.Fatalf("Error when trying to read log file: %v", err)
	}
	logtext := string(bytes)
	if !strings.Contains(logtext, "queue:get-artifact:SampleArtifacts/_/X.txt") || !strings.Contains(logtext, "generic-worker:cache:banana-cache") {
		t.Fatalf("Was expecting log file to contain missing scopes, but it doesn't")
	}
}

func TestCachesCanBeModified(t *testing.T) {
	defer setup(t, "TestCachesCanBeModified")()
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

func Test32BitOverflow(t *testing.T) {
	config = &gwconfig.Config{
		RequiredDiskSpaceMegabytes: 1024 * 10,
	}
	if requiredFreeSpace := requiredSpaceBytes(); requiredFreeSpace != 10737418240 {
		t.Fatalf("Some kind of int overflow problem: requiredFreeSpace is %v but expected it to be 10737418240", requiredFreeSpace)
	}
}

func TestCorruptZipDoesntCrashWorker(t *testing.T) {
	defer setup(t, "TestCorruptZipDoesntCrashWorker")()
	mounts := []MountEntry{
		// requires scope "queue:get-artifact:SampleArtifacts/_/X.txt"
		&ReadOnlyDirectory{
			Directory: ".",
			// Note: the task definition for taskId KTBKfEgxR5GdfIIREQIvFQ can be seen in the testdata/tasks directory
			Content: json.RawMessage(`{
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

	_ = submitAndAssert(t, td, payload, "failed", "failed")

	// check log mentions zip file is invalid
	bytes, err := ioutil.ReadFile(filepath.Join(taskContext.TaskDir, logPath))
	if err != nil {
		t.Fatalf("Error when trying to read log file: %v", err)
	}
	logtext := string(bytes)
	if !strings.Contains(logtext, "zip: not a valid zip file") {
		t.Fatalf("Was expecting log file to contain a zip error message, but it instead contains:\n%v", logtext)
	}
}

// We currently don't check for any of these strings:
//  [mounts] Could not fetch from %v into file %v: %v
//  [mounts] Could not make MkdirAll %v: %v
//  [mounts] Could not open file %v: %v
//  [mounts] Could not reach purgecache service to see if caches need purging:
//  [mounts] Could not write http response from %v to file %v: %v

type MountsLoggingTestCase struct {
	Test                   *testing.T
	Mounts                 []MountEntry
	Scopes                 []string
	TaskRunResolutionState string
	TaskRunReasonResolved  string
	PerTaskRunLogExcerpts  [][]string
	Payload                *GenericWorkerPayload
}

// This is an extremely strict test helper, that requires you to specify
// extracts from every log line that the mounts feature writes to the log
func LogTest(m *MountsLoggingTestCase) {
	defer setup(m.Test, m.Test.Name())()

	payload := m.Payload
	if payload == nil {
		payload = &GenericWorkerPayload{
			Command:    helloGoodbye(),
			MaxRunTime: 30,
		}
	}
	payload.Mounts = toMountArray(m.Test, &m.Mounts)

	for _, run := range m.PerTaskRunLogExcerpts {

		td := testTask(m.Test)
		td.Scopes = m.Scopes
		_ = submitAndAssert(m.Test, td, *payload, m.TaskRunResolutionState, m.TaskRunReasonResolved)

		// check log entries
		bytes, err := ioutil.ReadFile(filepath.Join(taskContext.TaskDir, logPath))
		if err != nil {
			m.Test.Fatalf("Error when trying to read log file: %v", err)
		}
		logtext := string(bytes)
		allLogLines := strings.Split(logtext, "\n")
		mountsLogLines := make([]string, 0, len(run))
		for _, logLine := range allLogLines {
			if strings.Contains(logLine, "[mounts] ") {
				mountsLogLines = append(mountsLogLines, logLine)
			}
		}
		if len(mountsLogLines) != len(run) {
			m.Test.Log("Wrong number of lines logged by mounts feature")
			m.Test.Log("Required lines:")
			for _, l := range run {
				m.Test.Log(l)
			}
			m.Test.Log("Actual logged lines:")
			for _, l := range mountsLogLines {
				m.Test.Log(l)
			}
			m.Test.FailNow()
		}
		for i := range mountsLogLines {
			if matched, err := regexp.MatchString(`\[mounts\] `+run[i], mountsLogLines[i]); err != nil || !matched {
				m.Test.Fatalf("Was expecting log line to match pattern '%v', but it does not:\n%v", run[i], mountsLogLines[i])
			}
		}
	}
}

func TestInvalidSHA256(t *testing.T) {
	LogTest(
		&MountsLoggingTestCase{
			Test: t,
			Mounts: []MountEntry{
				&ReadOnlyDirectory{
					Directory: "unknown_issuer_app_1",
					// Note: the task definition for taskId LK1Rz2UtT16d-HBSqyCtuA can be seen in the testdata/tasks directory
					Content: json.RawMessage(`{
						"taskId":   "LK1Rz2UtT16d-HBSqyCtuA",
						"artifact": "public/build/unknown_issuer_app_1.zip",
						"sha256":   "9263625672993742f0916f7a22b4d9924ed0327f2e02edd18456c0c4e5876850"
					}`),
					Format: "zip",
				},
			},
			TaskRunResolutionState: "failed",
			TaskRunReasonResolved:  "failed",
			PerTaskRunLogExcerpts: [][]string{
				// Required text from first task with no cached value
				[]string{
					`Downloading task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip to .*`,
					`Downloaded 4220 bytes with SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e from task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip to .*`,
					`Removing cache artifact:LK1Rz2UtT16d-HBSqyCtuA:public/build/unknown_issuer_app_1.zip from cache table`,
					`Deleting cache artifact:LK1Rz2UtT16d-HBSqyCtuA:public/build/unknown_issuer_app_1.zip file\(s\) at .*`,
					`Download .* of task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip has SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e but task definition explicitly requires 9263625672993742f0916f7a22b4d9924ed0327f2e02edd18456c0c4e5876850; not retrying download as there were no connection failures and HTTP response status code was 200`,
				},
				// Required text from second task when download is already cached
				[]string{
					`Downloading task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip to .*`,
					`Downloaded 4220 bytes with SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e from task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip to .*`,
					`Removing cache artifact:LK1Rz2UtT16d-HBSqyCtuA:public/build/unknown_issuer_app_1.zip from cache table`,
					`Deleting cache artifact:LK1Rz2UtT16d-HBSqyCtuA:public/build/unknown_issuer_app_1.zip file\(s\) at .*`,
					`Download .* of task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip has SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e but task definition explicitly requires 9263625672993742f0916f7a22b4d9924ed0327f2e02edd18456c0c4e5876850; not retrying download as there were no connection failures and HTTP response status code was 200`,
				},
			},
		},
	)
}

func TestValidSHA256(t *testing.T) {
	LogTest(
		&MountsLoggingTestCase{
			Test: t,
			Mounts: []MountEntry{
				&ReadOnlyDirectory{
					Directory: "unknown_issuer_app_1",
					// Note: the task definition for taskId LK1Rz2UtT16d-HBSqyCtuA can be seen in the testdata/tasks directory
					Content: json.RawMessage(`{
						"taskId":   "LK1Rz2UtT16d-HBSqyCtuA",
						"artifact": "public/build/unknown_issuer_app_1.zip",
						"sha256":   "625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e"
					}`),
					Format: "zip",
				},
			},
			TaskRunResolutionState: "completed",
			TaskRunReasonResolved:  "completed",
			PerTaskRunLogExcerpts: [][]string{
				// Required text from first task with no cached value
				[]string{
					`Downloading task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip to .*`,
					`Downloaded 4220 bytes with SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e from task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip to .*`,
					`Content from task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip \(.*\) matches required SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e`,
					`Creating directory .*unknown_issuer_app_1 with permissions 0700`,
					`Extracting zip file .* to '.*unknown_issuer_app_1'`,
				},
				// Required text from second task when download is already cached
				[]string{
					`Found existing download for artifact:LK1Rz2UtT16d-HBSqyCtuA:public/build/unknown_issuer_app_1.zip \(.*\) with correct SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e`,
					`Creating directory .*unknown_issuer_app_1 with permissions 0700`,
					`Extracting zip file .* to '.*unknown_issuer_app_1'`,
				},
			},
		},
	)
}

func TestFileMountNoSHA256(t *testing.T) {
	LogTest(
		&MountsLoggingTestCase{
			Test: t,
			Mounts: []MountEntry{
				&FileMount{
					File: "TestFileMountNoSHA256",
					// Note: the task definition for taskId LK1Rz2UtT16d-HBSqyCtuA can be seen in the testdata/tasks directory
					Content: json.RawMessage(`{
						"taskId":   "LK1Rz2UtT16d-HBSqyCtuA",
						"artifact": "public/build/unknown_issuer_app_1.zip"
					}`),
				},
			},
			TaskRunResolutionState: "completed",
			TaskRunReasonResolved:  "completed",
			PerTaskRunLogExcerpts: [][]string{
				// Required text from first task with no cached value
				[]string{
					`Downloading task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip to .*`,
					`Downloaded 4220 bytes with SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e from task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip to .*`,
					`Download .* of task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip has SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e but task payload does not declare a required value, so content authenticity cannot be verified`,
					`Creating directory .* with permissions 0700`,
					`Copying .* to .*TestFileMountNoSHA256`,
				},
				// Required text from second task when download is already cached
				[]string{
					`No SHA256 specified in task mounts for artifact:LK1Rz2UtT16d-HBSqyCtuA:public/build/unknown_issuer_app_1.zip - SHA256 from downloaded file .* is 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e.`,
					`Creating directory .* with permissions 0700`,
					`Copying .* to .*TestFileMountNoSHA256`,
				},
			},
		},
	)
}

func TestMountFileAtCWD(t *testing.T) {
	LogTest(
		&MountsLoggingTestCase{
			Test: t,
			Mounts: []MountEntry{
				&FileMount{
					// note path needs to be relative, not absolute, so don't use cwd here!
					// intentionally setting the path of a directory (current directory) since this should fail test
					// since a content can't be mounted at the location of an existing directory (content has no explicit filename)
					File: ".",
					// Note: the task definition for taskId LK1Rz2UtT16d-HBSqyCtuA can be seen in the testdata/tasks directory
					Content: json.RawMessage(`{
						"taskId":   "LK1Rz2UtT16d-HBSqyCtuA",
						"artifact": "public/build/unknown_issuer_app_1.zip"
					}`),
				},
			},
			TaskRunResolutionState: "failed",
			TaskRunReasonResolved:  "failed",
			PerTaskRunLogExcerpts: [][]string{
				// Required text from first task with no cached value
				[]string{
					`Downloading task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip to .*`,
					`Downloaded 4220 bytes with SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e from task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip to .*`,
					`Download .* of task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip has SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e but task payload does not declare a required value, so content authenticity cannot be verified`,
					`Creating directory .* with permissions 0700`,
					`Copying .* to .*`,
					`Not able to mount content from task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip at path .*`,
					`open .*: is a directory`,
				},
				// Required text from second task when download is already cached
				[]string{
					`No SHA256 specified in task mounts for artifact:LK1Rz2UtT16d-HBSqyCtuA:public/build/unknown_issuer_app_1.zip - SHA256 from downloaded file .* is 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e.`,
					`Creating directory .* with permissions 0700`,
					`Copying .* to .*`,
					`Not able to mount content from task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip at path .*`,
					`open .*: is a directory`,
				},
			},
		},
	)
}

func TestMountFileAndDirSameLocation(t *testing.T) {
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
			TaskRunResolutionState: "failed",
			TaskRunReasonResolved:  "failed",
			PerTaskRunLogExcerpts: [][]string{
				// Required text from first task with no cached value
				[]string{
					`Downloading task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip to .*`,
					`Downloaded 4220 bytes with SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e from task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip to .*`,
					`Download .* of task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip has SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e but task payload does not declare a required value, so content authenticity cannot be verified`,
					`Creating directory .* with permissions 0700`,
					`Copying .* to .*file-located-here`,
					`Found existing download for artifact:LK1Rz2UtT16d-HBSqyCtuA:public/build/unknown_issuer_app_1.zip \(.*\) with correct SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e`,
					`Creating directory .*file-located-here with permissions 0700`,
					// error is platform specific
					`mkdir .*file-located-here: (not a directory|The system cannot find the path specified.)`,
				},
				// Required text from second task when download is already cached
				[]string{
					`No SHA256 specified in task mounts for artifact:LK1Rz2UtT16d-HBSqyCtuA:public/build/unknown_issuer_app_1.zip - SHA256 from downloaded file .* is 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e.`,
					`Creating directory .* with permissions 0700`,
					`Copying .* to .*file-located-here`,
					`Found existing download for artifact:LK1Rz2UtT16d-HBSqyCtuA:public/build/unknown_issuer_app_1.zip \(.*\) with correct SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e`,
					`Creating directory .*file-located-here with permissions 0700`,
					// error is platform specific
					`mkdir .*file-located-here: (not a directory|The system cannot find the path specified.)`,
				},
			},
		},
	)
}

func TestWritableDirectoryCacheNoSHA256(t *testing.T) {
	LogTest(
		&MountsLoggingTestCase{
			Test: t,
			Mounts: []MountEntry{
				&WritableDirectoryCache{
					CacheName: "banana-cache",
					Directory: "TestWritableDirectoryCacheNoSHA256",
					// Note: the task definition for taskId LK1Rz2UtT16d-HBSqyCtuA can be seen in the testdata/tasks directory
					Content: json.RawMessage(`{
						"taskId":   "LK1Rz2UtT16d-HBSqyCtuA",
						"artifact": "public/build/unknown_issuer_app_1.zip"
					}`),
					Format: "zip",
				},
			},
			TaskRunResolutionState: "completed",
			TaskRunReasonResolved:  "completed",
			PerTaskRunLogExcerpts: [][]string{
				// Required text from first task with no cached value
				[]string{
					`No existing writable directory cache 'banana-cache' - creating .*`,
					`Downloading task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip to .*`,
					`Downloaded 4220 bytes with SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e from task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip to .*`,
					`Download .* of task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip has SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e but task payload does not declare a required value, so content authenticity cannot be verified`,
					`Creating directory .*TestWritableDirectoryCacheNoSHA256 with permissions 0700`,
					`Extracting zip file .* to '.*TestWritableDirectoryCacheNoSHA256'`,
					`Granting task user full control of '.*TestWritableDirectoryCacheNoSHA256' and subdirectories`,
					`Successfully mounted writable directory cache '.*TestWritableDirectoryCacheNoSHA256'`,
					`Preserving cache: Moving ".*TestWritableDirectoryCacheNoSHA256" to ".*"`,
				},
				// Required text from second task when download is already cached
				[]string{
					`Moving existing writable directory cache banana-cache from .* to .*TestWritableDirectoryCacheNoSHA256`,
					`Creating directory .* with permissions 0700`,
					`Granting task user full control of '.*TestWritableDirectoryCacheNoSHA256' and subdirectories`,
					`Successfully mounted writable directory cache '.*TestWritableDirectoryCacheNoSHA256'`,
					`Preserving cache: Moving ".*TestWritableDirectoryCacheNoSHA256" to ".*"`,
				},
			},
			Scopes: []string{"generic-worker:cache:banana-cache"},
		},
	)
}

// TestCacheMoved tests that if a test mounts a cache, and then moves it to a
// different location, that the test fails, and the worker doesn't crash.
func TestCacheMoved(t *testing.T) {
	LogTest(
		&MountsLoggingTestCase{
			Test: t,
			Mounts: []MountEntry{
				&WritableDirectoryCache{
					CacheName: "banana-cache",
					Directory: "TestCacheMoved",
					// Note: the task definition for taskId LK1Rz2UtT16d-HBSqyCtuA can be seen in the testdata/tasks directory
					Content: json.RawMessage(`{
						"taskId": "LK1Rz2UtT16d-HBSqyCtuA",
						"artifact": "public/build/unknown_issuer_app_1.zip",
						"sha256": "625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e"
					}`),
					Format: "zip",
				},
			},
			Scopes: []string{"generic-worker:cache:banana-cache"},
			Payload: &GenericWorkerPayload{
				Command:    goRun("move-file.go", "TestCacheMoved", "MovedCache"),
				MaxRunTime: 180,
			},
			TaskRunResolutionState: "failed",
			TaskRunReasonResolved:  "failed",
			PerTaskRunLogExcerpts: [][]string{
				// Required text from first task with no cached value
				[]string{
					`No existing writable directory cache 'banana-cache' - creating .*`,
					`Downloading task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip to .*`,
					`Downloaded 4220 bytes with SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e from task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip to .*`,
					`Content from task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip \(.*\) matches required SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e`,
					`Creating directory .*TestCacheMoved with permissions 0700`,
					`Extracting zip file .* to '.*TestCacheMoved'`,
					`Granting task user full control of '.*TestCacheMoved' and subdirectories`,
					`Successfully mounted writable directory cache '.*TestCacheMoved'`,
					`Preserving cache: Moving ".*TestCacheMoved" to ".*"`,
					`Removing cache banana-cache from cache table`,
					`Deleting cache banana-cache file\(s\) at .*`,
					`Could not unmount task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip due to: 'Could not persist cache "banana-cache" due to .*'`,
				},
				// Required text from second task when download is already cached
				[]string{
					`No existing writable directory cache 'banana-cache' - creating .*`,
					`Found existing download for artifact:LK1Rz2UtT16d-HBSqyCtuA:public/build/unknown_issuer_app_1.zip \(.*\) with correct SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e`,
					`Creating directory .*TestCacheMoved with permissions 0700`,
					`Extracting zip file .* to '.*TestCacheMoved'`,
					`Granting task user full control of '.*TestCacheMoved' and subdirectories`,
					`Successfully mounted writable directory cache '.*TestCacheMoved'`,
					`Preserving cache: Moving ".*TestCacheMoved" to ".*"`,
					`Removing cache banana-cache from cache table`,
					`Deleting cache banana-cache file\(s\) at .*`,
					`Could not unmount task LK1Rz2UtT16d-HBSqyCtuA artifact public/build/unknown_issuer_app_1.zip due to: 'Could not persist cache "banana-cache" due to .*'`,
				},
			},
		},
	)

}
