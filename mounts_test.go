package main

import (
	"encoding/json"
	"io/ioutil"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/taskcluster/generic-worker/gwconfig"
	"github.com/taskcluster/slugid-go/slugid"
)

func TestMissingScopes(t *testing.T) {
	defer setup(t)()

	taskID := CreateArtifactFromFile(t, "SampleArtifacts/_/X.txt", "SampleArtifacts/_/X.txt")

	// Create a new task to mount the artifact without the scope to do so
	mounts := []MountEntry{
		// requires scope "queue:get-artifact:SampleArtifacts/_/X.txt"
		&FileMount{
			File: filepath.Join("preloaded", "Mr X.txt"),
			Content: json.RawMessage(`{
				"taskId":   "` + taskID + `",
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
	td.Dependencies = []string{
		taskID,
	}
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

// TestMissingDependency tests that if artifact content is mounted, it must be included as a task dependency
func TestMissingMountsDependency(t *testing.T) {
	defer setup(t)()
	pretendTaskID := slugid.Nice()
	mounts := []MountEntry{
		// requires scope "queue:get-artifact:SampleArtifacts/_/X.txt"
		&FileMount{
			File: filepath.Join("preloaded", "Mr X.txt"),
			// Pretend task
			Content: json.RawMessage(`{
				"taskId":   "` + pretendTaskID + `",
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
	td.Scopes = []string{
		"generic-worker:cache:banana-cache",
		"queue:get-artifact:SampleArtifacts/_/X.txt",
	}

	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")

	// check log mentions task dependency failure
	bytes, err := ioutil.ReadFile(filepath.Join(taskContext.TaskDir, logPath))
	if err != nil {
		t.Fatalf("Error when trying to read log file: %v", err)
	}
	logtext := string(bytes)
	if !strings.Contains(logtext, "[mounts] task.dependencies needs to include "+pretendTaskID+" since one or more of its artifacts are mounted") {
		t.Fatalf("Was expecting log file to explain that task dependency was missing, but it doesn't: \n%v", logtext)
	}
}

func Test32BitOverflow(t *testing.T) {
	config = &gwconfig.Config{
		PublicConfig: gwconfig.PublicConfig{
			RequiredDiskSpaceMegabytes: 1024 * 10,
		},
	}
	if requiredFreeSpace := requiredSpaceBytes(); requiredFreeSpace != 10737418240 {
		t.Fatalf("Some kind of int overflow problem: requiredFreeSpace is %v but expected it to be 10737418240", requiredFreeSpace)
	}
}

func TestCorruptZipDoesntCrashWorker(t *testing.T) {
	defer setup(t)()

	taskID := CreateArtifactFromFile(t, "SampleArtifacts/_/X.txt", "SampleArtifacts/_/X.txt")

	mounts := []MountEntry{
		// requires scope "queue:get-artifact:SampleArtifacts/_/X.txt"
		&ReadOnlyDirectory{
			Directory: ".",
			Content: json.RawMessage(`{
				"taskId":   "` + taskID + `",
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
	td.Dependencies = []string{
		taskID,
	}
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

// TODO: maybe want to create a test where an error artifact is uploaded but
// task is resolved as successful, and then have artifact content that mounts
// the error artifact. This would be a bizarre test case though as it would be
// unusual for a task to resolve successfully if it contains error artifacts -
// although there is nothing stopping a task from publishing error artifacts
// and then resolving successfully - so it could be an attack vector for a
// malicious task.

// TestNonExistentArtifact depends on an artifact that does not exist from a
// task that *does* exist.
func TestNonExistentArtifact(t *testing.T) {
	defer setup(t)()

	taskID := CreateArtifactFromFile(t, "SampleArtifacts/_/X.txt", "SampleArtifacts/_/X.txt")

	mounts := []MountEntry{
		// requires scope "queue:get-artifact:SampleArtifacts/_/X.txt"
		&ReadOnlyDirectory{
			Directory: ".",
			Content: json.RawMessage(`{
				"taskId":   "` + taskID + `",
				"artifact": "SampleArtifacts/_/non-existent-artifact.txt"
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
		taskID,
	}
	td.Scopes = []string{"queue:get-artifact:SampleArtifacts/_/non-existent-artifact.txt"}

	_ = submitAndAssert(t, td, payload, "failed", "failed")

	// check log mentions zip file is invalid
	bytes, err := ioutil.ReadFile(filepath.Join(taskContext.TaskDir, logPath))
	if err != nil {
		t.Fatalf("Error when trying to read log file: %v", err)
	}
	logtext := string(bytes)
	if !strings.Contains(logtext, "[mounts] Could not fetch from task "+taskID+" artifact SampleArtifacts/_/non-existent-artifact.txt into file") {
		t.Fatalf("Log did not contain expected text:\n%v", logtext)
	}
}

// We currently don't check for any of these strings:
//  [mounts] Could not download %v to %v due to %v
//  [mounts] Could not make MkdirAll %v: %v
//  [mounts] Could not open file %v: %v
//  [mounts] Could not reach purgecache service to see if caches need purging:
//  [mounts] Could not write http response from %v to file %v: %v

type MountsLoggingTestCase struct {
	Test                   *testing.T
	Mounts                 []MountEntry
	Scopes                 []string
	Dependencies           []string
	TaskRunResolutionState string
	TaskRunReasonResolved  string
	PerTaskRunLogExcerpts  [][]string
	Payload                *GenericWorkerPayload
}

// This is an extremely strict test helper, that requires you to specify
// extracts from every log line that the mounts feature writes to the log
func LogTest(m *MountsLoggingTestCase) {
	payload := m.Payload
	if payload == nil {
		payload = &GenericWorkerPayload{
			Command:    helloGoodbye(),
			MaxRunTime: 180,
		}
	}
	payload.Mounts = toMountArray(m.Test, &m.Mounts)

	for _, run := range m.PerTaskRunLogExcerpts {

		td := testTask(m.Test)
		td.Scopes = m.Scopes
		td.Dependencies = m.Dependencies
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
		err = os.RemoveAll(taskContext.TaskDir)
		if err != nil {
			m.Test.Fatalf("Could not delete task directory: %v", err)
		}
	}
}

func TestInvalidSHA256(t *testing.T) {
	defer setup(t)()
	taskID := CreateArtifactFromFile(t, "unknown_issuer_app_1.zip", "public/build/unknown_issuer_app_1.zip")
	LogTest(
		&MountsLoggingTestCase{
			Test: t,
			Mounts: []MountEntry{
				&ReadOnlyDirectory{
					Directory: "unknown_issuer_app_1",
					Content: json.RawMessage(`{
						"taskId":   "` + taskID + `",
						"artifact": "public/build/unknown_issuer_app_1.zip",
						"sha256":   "9263625672993742f0916f7a22b4d9924ed0327f2e02edd18456c0c4e5876850"
					}`),
					Format: "zip",
				},
			},
			Dependencies: []string{
				taskID,
			},
			TaskRunResolutionState: "failed",
			TaskRunReasonResolved:  "failed",
			PerTaskRunLogExcerpts: [][]string{
				// Required text from first task with no cached value
				[]string{
					`Downloading task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip to .*`,
					`Downloaded 4220 bytes with SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e from task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip to .*`,
					`Removing cache artifact:` + taskID + `:public/build/unknown_issuer_app_1.zip from cache table`,
					`Deleting cache artifact:` + taskID + `:public/build/unknown_issuer_app_1.zip file\(s\) at .*`,
					`Download .* of task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip has SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e but task definition explicitly requires 9263625672993742f0916f7a22b4d9924ed0327f2e02edd18456c0c4e5876850; not retrying download as there were no connection failures and HTTP response status code was 200`,
				},
				// Required text from second task when download is already cached
				[]string{
					`Downloading task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip to .*`,
					`Downloaded 4220 bytes with SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e from task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip to .*`,
					`Removing cache artifact:` + taskID + `:public/build/unknown_issuer_app_1.zip from cache table`,
					`Deleting cache artifact:` + taskID + `:public/build/unknown_issuer_app_1.zip file\(s\) at .*`,
					`Download .* of task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip has SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e but task definition explicitly requires 9263625672993742f0916f7a22b4d9924ed0327f2e02edd18456c0c4e5876850; not retrying download as there were no connection failures and HTTP response status code was 200`,
				},
			},
		},
	)
}

func TestValidSHA256(t *testing.T) {
	defer setup(t)()
	taskID := CreateArtifactFromFile(t, "unknown_issuer_app_1.zip", "public/build/unknown_issuer_app_1.zip")

	// whether permission is granted to task user depends if running under windows or not
	// and is independent of whether running as current user or not
	granting, _ := grantingDenying(t, "directory", "unknown_issuer_app_1")

	// Required text from first task with no cached value
	pass1 := append([]string{
		`Downloading task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip to .*`,
		`Downloaded 4220 bytes with SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e from task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip to .*`,
		`Content from task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip \(.*\) matches required SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e`,
		`Creating directory .*unknown_issuer_app_1 with permissions 0700`,
		`Extracting zip file .* to '.*unknown_issuer_app_1'`,
	},
		granting...,
	)

	// Required text from second task when download is already cached
	pass2 := append([]string{
		`Found existing download for artifact:` + taskID + `:public/build/unknown_issuer_app_1.zip \(.*\) with correct SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e`,
		`Creating directory .*unknown_issuer_app_1 with permissions 0700`,
		`Extracting zip file .* to '.*unknown_issuer_app_1'`,
	},
		granting...,
	)

	LogTest(
		&MountsLoggingTestCase{
			Test: t,
			Mounts: []MountEntry{
				&ReadOnlyDirectory{
					Directory: "unknown_issuer_app_1",
					Content: json.RawMessage(`{
						"taskId":   "` + taskID + `",
						"artifact": "public/build/unknown_issuer_app_1.zip",
						"sha256":   "625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e"
					}`),
					Format: "zip",
				},
			},
			Dependencies: []string{
				taskID,
			},
			TaskRunResolutionState: "completed",
			TaskRunReasonResolved:  "completed",
			PerTaskRunLogExcerpts: [][]string{
				pass1,
				pass2,
			},
		},
	)
}

func TestFileMountNoSHA256(t *testing.T) {
	defer setup(t)()
	taskID := CreateArtifactFromFile(t, "unknown_issuer_app_1.zip", "public/build/unknown_issuer_app_1.zip")

	// whether permission is granted to task user depends if running under windows or not
	// and is independent of whether running as current user or not
	granting, _ := grantingDenying(t, "file", t.Name())

	// No cache on first pass
	pass1 := append([]string{
		`Downloading task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip to .*`,
		`Downloaded 4220 bytes with SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e from task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip to .*`,
		`Download .* of task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip has SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e but task payload does not declare a required value, so content authenticity cannot be verified`,
		`Creating directory .* with permissions 0700`,
		`Copying .* to .*` + t.Name(),
	},
		granting...,
	)

	// On second pass, cache already exists
	pass2 := append([]string{
		`No SHA256 specified in task mounts for artifact:` + taskID + `:public/build/unknown_issuer_app_1.zip - SHA256 from downloaded file .* is 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e.`,
		`Creating directory .* with permissions 0700`,
		`Copying .* to .*` + t.Name(),
	},
		granting...,
	)

	LogTest(
		&MountsLoggingTestCase{
			Test: t,
			Mounts: []MountEntry{
				&FileMount{
					File: t.Name(),
					Content: json.RawMessage(`{
						"taskId":   "` + taskID + `",
						"artifact": "public/build/unknown_issuer_app_1.zip"
					}`),
				},
			},
			Dependencies: []string{
				taskID,
			},
			TaskRunResolutionState: "completed",
			TaskRunReasonResolved:  "completed",
			PerTaskRunLogExcerpts: [][]string{
				// Required text from first task with no cached value
				pass1,
				// Required text from second task when download is already cached
				pass2,
			},
		},
	)
}

func TestMountFileAtCWD(t *testing.T) {
	defer setup(t)()
	taskID := CreateArtifactFromFile(t, "unknown_issuer_app_1.zip", "public/build/unknown_issuer_app_1.zip")
	LogTest(
		&MountsLoggingTestCase{
			Test: t,
			Mounts: []MountEntry{
				&FileMount{
					// note path needs to be relative, not absolute, so don't use cwd here!
					// intentionally setting the path of a directory (current directory) since this should fail test
					// since a content can't be mounted at the location of an existing directory (content has no explicit filename)
					File: ".",
					Content: json.RawMessage(`{
						"taskId":   "` + taskID + `",
						"artifact": "public/build/unknown_issuer_app_1.zip"
					}`),
				},
			},
			Dependencies: []string{
				taskID,
			},
			TaskRunResolutionState: "failed",
			TaskRunReasonResolved:  "failed",
			PerTaskRunLogExcerpts: [][]string{
				// Required text from first task with no cached value
				[]string{
					`Downloading task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip to .*`,
					`Downloaded 4220 bytes with SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e from task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip to .*`,
					`Download .* of task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip has SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e but task payload does not declare a required value, so content authenticity cannot be verified`,
					`Creating directory .* with permissions 0700`,
					`Copying .* to .*`,
					`Not able to mount content from task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip at path .*`,
					`open .*: is a directory`,
				},
				// Required text from second task when download is already cached
				[]string{
					`No SHA256 specified in task mounts for artifact:` + taskID + `:public/build/unknown_issuer_app_1.zip - SHA256 from downloaded file .* is 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e.`,
					`Creating directory .* with permissions 0700`,
					`Copying .* to .*`,
					`Not able to mount content from task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip at path .*`,
					`open .*: is a directory`,
				},
			},
		},
	)
}

func TestWritableDirectoryCacheNoSHA256(t *testing.T) {
	defer setup(t)()
	taskID := CreateArtifactFromFile(t, "unknown_issuer_app_1.zip", "public/build/unknown_issuer_app_1.zip")

	// whether permission is granted to task user depends if running under windows or not
	// and is independent of whether running as current user or not
	granting, denying := grantingDenying(t, "directory", t.Name())

	// No cache on first pass
	pass1 := append([]string{
		`No existing writable directory cache 'banana-cache' - creating .*`,
		`Downloading task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip to .*`,
		`Downloaded 4220 bytes with SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e from task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip to .*`,
		`Download .* of task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip has SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e but task payload does not declare a required value, so content authenticity cannot be verified`,
		`Creating directory .*` + t.Name() + ` with permissions 0700`,
		`Extracting zip file .* to '.*` + t.Name() + `'`,
	},
		granting...,
	)
	pass1 = append(pass1,
		`Successfully mounted writable directory cache '.*`+t.Name()+`'`,
		`Preserving cache: Moving ".*`+t.Name()+`" to ".*"`,
	)
	pass1 = append(pass1, denying...)

	// On second pass, cache already exists
	pass2 := append([]string{
		`Moving existing writable directory cache banana-cache from .* to .*` + t.Name(),
		`Creating directory .* with permissions 0700`,
	},
		granting...,
	)
	pass2 = append(pass2,
		`Successfully mounted writable directory cache '.*`+t.Name()+`'`,
		`Preserving cache: Moving ".*`+t.Name()+`" to ".*"`,
	)
	pass2 = append(pass2, denying...)

	LogTest(
		&MountsLoggingTestCase{
			Test: t,
			Mounts: []MountEntry{
				&WritableDirectoryCache{
					CacheName: "banana-cache",
					Directory: t.Name(),
					Content: json.RawMessage(`{
						"taskId":   "` + taskID + `",
						"artifact": "public/build/unknown_issuer_app_1.zip"
					}`),
					Format: "zip",
				},
			},
			Dependencies: []string{
				taskID,
			},
			TaskRunResolutionState: "completed",
			TaskRunReasonResolved:  "completed",
			PerTaskRunLogExcerpts: [][]string{
				// Required text from first task with no cached value
				pass1,
				// Required text from second task when download is already cached
				pass2,
			},
			Scopes: []string{"generic-worker:cache:banana-cache"},
		},
	)
}
