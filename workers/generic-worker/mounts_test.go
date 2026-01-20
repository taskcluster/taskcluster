package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/slugid-go/slugid"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/gwconfig"
)

func TestMissingScopes(t *testing.T) {
	setup(t)

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
	defaults.SetDefaults(&payload)

	td := testTask(t)
	td.Dependencies = []string{
		taskID,
	}
	// don't set any scopes

	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")

	logtext := LogText(t)
	if !strings.Contains(logtext, "generic-worker:cache:banana-cache") {
		t.Fatalf("Was expecting log file to contain missing worker-enforced scopes, but it doesn't")
	}
}

// TestMissingMountsDependency tests that if artifact content is mounted, it
// must be included as a task dependency
func TestMissingMountsDependency(t *testing.T) {
	setup(t)
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
	defaults.SetDefaults(&payload)

	td := testTask(t)
	td.Scopes = []string{
		"generic-worker:cache:banana-cache",
		"queue:get-artifact:SampleArtifacts/_/X.txt",
	}

	_ = submitAndAssert(t, td, payload, "exception", "malformed-payload")

	logtext := LogText(t)
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
	setup(t)

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
	defaults.SetDefaults(&payload)

	td := testTask(t)
	td.Dependencies = []string{
		taskID,
	}
	td.Scopes = []string{"queue:get-artifact:SampleArtifacts/_/X.txt"}

	_ = submitAndAssert(t, td, payload, "failed", "failed")

	logtext := LogText(t)
	if !strings.Contains(logtext, "cannot unarchive") {
		t.Fatalf("Was expecting log file to contain an unarchive error message, but it instead contains:\n%v", logtext)
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
	setup(t)

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
	defaults.SetDefaults(&payload)

	td := testTask(t)
	td.Dependencies = []string{
		taskID,
	}
	td.Scopes = []string{"queue:get-artifact:SampleArtifacts/_/non-existent-artifact.txt"}

	_ = submitAndAssert(t, td, payload, "failed", "failed")

	logtext := LogText(t)
	expectedText := "[mounts] Could not fetch from task " + taskID + " artifact SampleArtifacts/_/non-existent-artifact.txt into file"
	if !strings.Contains(logtext, expectedText) {
		t.Fatalf("Log did not contain expected text %q:\n%v", expectedText, logtext)
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
	PerTaskExtraTesting    func(*testing.T)
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
		defaults.SetDefaults(payload)
	}
	payload.Mounts = toMountArray(m.Test, &m.Mounts)

	for _, run := range m.PerTaskRunLogExcerpts {

		td := testTask(m.Test)
		td.Scopes = m.Scopes
		td.Dependencies = m.Dependencies
		_ = submitAndAssert(m.Test, td, *payload, m.TaskRunResolutionState, m.TaskRunReasonResolved)

		logtext := LogText(m.Test)
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
				m.Test.Fatalf("Was expecting log line to match pattern '%v', but it does not:\n%v\n\n%s", run[i], mountsLogLines[i], logtext)
			}
		}

		if m.PerTaskExtraTesting != nil {
			m.PerTaskExtraTesting(m.Test)
		}

		err := os.RemoveAll(taskContext.TaskDir)
		if err != nil {
			m.Test.Fatalf("Could not delete task directory: %v", err)
		}
	}
}

func TestInvalidSHA256(t *testing.T) {
	setup(t)
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
				{
					`Downloading task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip to .*`,
					`Downloaded 4220 bytes with SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e from task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip to .*`,
					`Removing cache artifact:` + taskID + `:public/build/unknown_issuer_app_1.zip from cache table`,
					`Deleting cache artifact:` + taskID + `:public/build/unknown_issuer_app_1.zip file\(s\) at .*`,
					`Download .* of task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip has SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e but task definition explicitly requires 9263625672993742f0916f7a22b4d9924ed0327f2e02edd18456c0c4e5876850; not retrying download as there were no connection failures and HTTP response status code was 200`,
				},
				// Required text from second task when download is already cached
				{
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
	setup(t)
	taskID := CreateArtifactFromFile(t, "unknown_issuer_app_1.zip", "public/build/unknown_issuer_app_1.zip")

	// whether permission is granted to task user depends if running under windows or not
	// and is independent of whether running as current user or not
	grantingDir, _ := grantingDenying(t, "directory", false, "unknown_issuer_app_1")
	grantingCacheFile, _ := grantingDenying(t, "file", true)

	// Required text from first task with no cached value
	pass1 := append([]string{
		`Downloading task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip to .*`,
		`Downloaded 4220 bytes with SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e from task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip to .*`,
		`Content from task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip \(.*\) matches required SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e`,
		`Creating directory .*unknown_issuer_app_1`,
		`Copying file '.*' to '.*'`,
	},
		grantingCacheFile...,
	)
	pass1 = append(pass1,
		`Extracting zip file .* to '.*unknown_issuer_app_1'`,
		`Removing file '.*'`,
	)
	pass1 = append(pass1,
		grantingDir...,
	)

	// Required text from second task when download is already cached
	pass2 := append([]string{
		`Found existing download for artifact:` + taskID + `:public/build/unknown_issuer_app_1.zip \(.*\) with correct SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e`,
		`Creating directory .*unknown_issuer_app_1`,
		`Copying file '.*' to '.*'`,
	},
		grantingCacheFile...,
	)
	pass2 = append(pass2,
		`Extracting zip file .* to '.*unknown_issuer_app_1'`,
		`Removing file '.*'`,
	)
	pass2 = append(pass2,
		grantingDir...,
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
	setup(t)
	taskID := CreateArtifactFromFile(t, "unknown_issuer_app_1.zip", "public/build/unknown_issuer_app_1.zip")

	// whether permission is granted to task user depends if running under windows or not
	// and is independent of whether running as current user or not
	granting, _ := grantingDenying(t, "file", false, t.Name())

	// No cache on first pass
	pass1 := append([]string{
		`Downloading task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip to .*`,
		`Downloaded 4220 bytes with SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e from task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip to .*`,
		`Download .* of task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip has SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e but task payload does not declare a required value, so content authenticity cannot be verified`,
		`Creating directory .*`,
		`Copying .* to .*` + t.Name(),
	},
		granting...,
	)

	// On second pass, cache already exists
	pass2 := append([]string{
		`No SHA256 specified in task mounts for artifact:` + taskID + `:public/build/unknown_issuer_app_1.zip - SHA256 from downloaded file .* is 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e.`,
		`Creating directory .*`,
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

func TestFileMountWithCompression(t *testing.T) {
	setup(t)
	taskID := CreateArtifactFromFile(t, "compressed-file-mount.txt.gz", "public/build/compressed-file-mount.txt.gz")

	// whether permission is granted to task user depends if running under windows or not
	// and is independent of whether running as current user or not
	granting, _ := grantingDenying(t, "file", false, t.Name())

	// No cache on first pass
	pass1 := append([]string{
		`Downloading task ` + taskID + ` artifact public/build/compressed-file-mount.txt.gz to .*`,
		`Downloaded 89 bytes with SHA256 a37856e8cd10250f76dc076bb03d380b16a870dec31f3461223f753124a4b28a from task ` + taskID + ` artifact public/build/compressed-file-mount.txt.gz to .*`,
		`Content from task ` + taskID + ` artifact public/build/compressed-file-mount.txt.gz .* matches required SHA256 a37856e8cd10250f76dc076bb03d380b16a870dec31f3461223f753124a4b28a`,
		`Creating directory .*`,
		`Decompressing gz file .* to .*` + t.Name(),
	},
		granting...,
	)

	// On second pass, cache already exists
	pass2 := append([]string{
		`Found existing download for artifact:` + taskID + `:public/build/compressed-file-mount.txt.gz .* with correct SHA256 a37856e8cd10250f76dc076bb03d380b16a870dec31f3461223f753124a4b28a`,
		`Creating directory .*`,
		`Decompressing gz file .* to .*` + t.Name(),
	},
		granting...,
	)

	payload := GenericWorkerPayload{
		Command:    printFileContents(t.Name()),
		MaxRunTime: 10,
	}
	defaults.SetDefaults(&payload)

	LogTest(
		&MountsLoggingTestCase{
			Test: t,
			Mounts: []MountEntry{
				&FileMount{
					File: t.Name(),
					Content: json.RawMessage(`{
						"taskId":   "` + taskID + `",
						"artifact": "public/build/compressed-file-mount.txt.gz",
						"sha256":	"a37856e8cd10250f76dc076bb03d380b16a870dec31f3461223f753124a4b28a"
					}`),
					Format: "gz",
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
			Payload: &payload,
			PerTaskExtraTesting: func(t *testing.T) {
				t.Helper()
				expectedText := "testing file mounts with compression!"
				if logtext := LogText(t); !strings.Contains(logtext, expectedText) {
					t.Fatalf("Was expecting log to contain text %q but it didn't: %v", expectedText, logtext)
				}
			},
		},
	)
}

func TestMountFileAtCWD(t *testing.T) {
	setup(t)
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
				{
					"cannot mount file at path .* since it already exists as a directory",
				},
			},
		},
	)
}

func TestWritableDirectoryCacheNoSHA256(t *testing.T) {
	setup(t)
	taskID := CreateArtifactFromFile(t, "unknown_issuer_app_1.zip", "public/build/unknown_issuer_app_1.zip")

	// whether permission is granted to task user depends if running under windows or not
	// and is independent of whether running as current user or not
	grantingCacheFile, _ := grantingDenying(t, "file", true)
	updatingOwnership := updateOwnership(t)

	// No cache on first pass
	pass1 := append([]string{
		`No existing writable directory cache 'banana-cache' - creating .*`,
		`Downloading task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip to .*`,
		`Downloaded 4220 bytes with SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e from task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip to .*`,
		`Download .* of task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip has SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e but task payload does not declare a required value, so content authenticity cannot be verified`,
		`Creating directory .*` + t.Name(),
		`Copying file '.*' to '.*'`,
	},
		grantingCacheFile...,
	)
	pass1 = append(pass1,
		`Extracting zip file .* to '.*`+t.Name()+`'`,
		`Removing file '.*'`,
	)
	pass1 = append(pass1,
		updatingOwnership...,
	)
	pass1 = append(pass1,
		`Successfully mounted writable directory cache '.*`+t.Name()+`'`,
		`Preserving cache: Moving ".*`+t.Name()+`" to ".*"`,
	)

	// On second pass, cache already exists
	pass2 := append([]string{
		`Moving existing writable directory cache banana-cache from .* to .*` + t.Name(),
		`Creating directory .*`,
	},
		updatingOwnership...,
	)
	pass2 = append(pass2,
		`Successfully mounted writable directory cache '.*`+t.Name()+`'`,
		`Preserving cache: Moving ".*`+t.Name()+`" to ".*"`,
	)

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

func TestMounts(t *testing.T) {

	setup(t)

	taskID1 := CreateArtifactFromFile(t, "SampleArtifacts/_/X.txt", "SampleArtifacts/_/X.txt")
	taskID2 := CreateArtifactFromFile(t, "mozharness.zip", "public/build/mozharness.zip")
	taskID3 := CreateArtifactFromFile(t, "unknown_issuer_app_1.zip", "public/build/unknown_issuer_app_1.zip")

	mounts := []MountEntry{

		// file mount from artifact
		&FileMount{
			File: filepath.Join("preloaded", "Mr X.txt"),
			Content: json.RawMessage(`{
				"taskId":   "` + taskID1 + `",
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
			Content: json.RawMessage(`{
				"taskId":   "` + taskID3 + `",
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
			Content: json.RawMessage(`{
				"taskId":   "` + taskID2 + `",
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
	defaults.SetDefaults(&payload)

	td := testTask(t)
	td.Dependencies = []string{
		taskID1,
		taskID2,
		taskID3,
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
		fileCaches["artifact:"+taskID3+":public/build/unknown_issuer_app_1.zip"].Location,
	)
	checkSHA256(
		t,
		"c075e31488502350611e9ff5740d405cc5c190f03996b26c1f47b2ec68bd14ac",
		fileCaches["urlcontent:https://github.com/taskcluster/logserver/raw/53134a5b9cbece05752c0ecc1a6c6d7c2fbf6580/node_modules/express/node_modules/connect/node_modules/multiparty/test/fixture/file/binaryfile.tar.gz"].Location,
	)
	checkSHA256(
		t,
		"8308d593eb56527137532595a60255a3fcfbe4b6b068e29b22d99742bad80f6f",
		fileCaches["artifact:"+taskID1+":SampleArtifacts/_/X.txt"].Location,
	)
	checkSHA256(
		t,
		"96f72a068ed0aa4db440f5dc49379d6567b1e6c0c5bac44dc905745639c4314b",
		fileCaches["urlcontent:https://raw.githubusercontent.com/taskcluster/testrepo/db12070fc7ea6e5d21797bf943c0b9466fb4d65e/generic-worker/check-shasums.sh"].Location,
	)
	checkSHA256(
		t,
		"613193e90dcba442ffa01622834387bb5f175fdc67c46f564284261076994a75",
		fileCaches["artifact:"+taskID2+":public/build/mozharness.zip"].Location,
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
	setup(t)
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
		MaxRunTime: 180,
	}
	defaults.SetDefaults(&payload)

	execute := func() {
		td := testTask(t)
		td.Scopes = []string{"generic-worker:cache:test-modifications"}
		_ = submitAndAssert(t, td, payload, "completed", "completed")
	}

	getCounter := func() int {
		counterFile := filepath.Join(directoryCaches["test-modifications"].Location, "counter")
		bytes, err := os.ReadFile(counterFile)
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
	setup(t)
	taskID := CreateArtifactFromFile(t, "unknown_issuer_app_1.zip", "public/build/unknown_issuer_app_1.zip")

	// whether permission is granted to task user depends if running under windows or not
	// and is independent of whether running as current user or not
	grantingCacheFile, _ := grantingDenying(t, "file", true)
	updatingOwnership := updateOwnership(t)

	// No cache on first pass
	pass1 := append([]string{
		`No existing writable directory cache 'banana-cache' - creating .*`,
		`Downloading task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip to .*`,
		`Downloaded 4220 bytes with SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e from task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip to .*`,
		`Content from task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip \(.*\) matches required SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e`,
		`Creating directory .*` + t.Name(),
		`Copying file '.*' to '.*'`,
	},
		grantingCacheFile...,
	)
	pass1 = append(pass1,
		`Extracting zip file .* to '.*`+t.Name()+`'`,
		`Removing file '.*'`,
	)
	pass1 = append(pass1,
		updatingOwnership...,
	)
	pass1 = append(pass1,
		`Successfully mounted writable directory cache '.*`+t.Name()+`'`,
		`Preserving cache: Moving ".*`+t.Name()+`" to ".*"`,
		`Removing cache banana-cache from cache table`,
		`Deleting cache banana-cache file\(s\) at .*`,
		`Could not unmount task `+taskID+` artifact public/build/unknown_issuer_app_1.zip due to: 'could not persist cache "banana-cache" due to .*'`,
	)

	// On second pass, cache already exists
	pass2 := append([]string{
		`No existing writable directory cache 'banana-cache' - creating .*`,
		`Found existing download for artifact:` + taskID + `:public/build/unknown_issuer_app_1.zip \(.*\) with correct SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e`,
		`Creating directory .*` + t.Name(),
		`Copying file '.*' to '.*'`,
	},
		grantingCacheFile...,
	)
	pass2 = append(pass2,
		`Extracting zip file .* to '.*`+t.Name()+`'`,
		`Removing file '.*'`,
	)
	pass2 = append(pass2,
		updatingOwnership...,
	)
	pass2 = append(pass2,
		`Successfully mounted writable directory cache '.*`+t.Name()+`'`,
		`Preserving cache: Moving ".*`+t.Name()+`" to ".*"`,
		`Removing cache banana-cache from cache table`,
		`Deleting cache banana-cache file\(s\) at .*`,
		`Could not unmount task `+taskID+` artifact public/build/unknown_issuer_app_1.zip due to: 'could not persist cache "banana-cache" due to .*'`,
	)

	payload := GenericWorkerPayload{
		Command:    goRun("move-file.go", t.Name(), "MovedCache"),
		MaxRunTime: 100,
	}
	defaults.SetDefaults(&payload)

	LogTest(
		&MountsLoggingTestCase{
			Test: t,
			Mounts: []MountEntry{
				&WritableDirectoryCache{
					CacheName: "banana-cache",
					Directory: t.Name(),
					Content: json.RawMessage(`{
						"taskId": "` + taskID + `",
						"artifact": "public/build/unknown_issuer_app_1.zip",
						"sha256": "625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e"
					}`),
					Format: "zip",
				},
			},
			Dependencies: []string{
				taskID,
			},
			Scopes:                 []string{"generic-worker:cache:banana-cache"},
			Payload:                &payload,
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

	setup(t)
	taskID := CreateArtifactFromFile(t, "unknown_issuer_app_1.zip", "public/build/unknown_issuer_app_1.zip")

	// whether permission is granted to task user depends if running under windows or not
	// and is independent of whether running as current user or not
	granting, _ := grantingDenying(t, "file", false, "file-located-here")

	// No cache on first pass
	pass1 := append([]string{
		`Downloading task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip to .*`,
		`Downloaded 4220 bytes with SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e from task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip to .*`,
		`Download .* of task ` + taskID + ` artifact public/build/unknown_issuer_app_1.zip has SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e but task payload does not declare a required value, so content authenticity cannot be verified`,
		`Creating directory .*`,
		`Copying .* to .*file-located-here`,
	},
		granting...,
	)

	pass1 = append(pass1,
		`Found existing download for artifact:`+taskID+`:public/build/unknown_issuer_app_1.zip \(.*\) with correct SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e`,
		`Creating directory .*file-located-here`,
		// error is platform specific
		`(mkdir .*file-located-here: not a directory|mkdir .*file-located-here: The system cannot find the path specified.|cannot create directory .*file-located-here)`,
	)

	// On second pass, cache already exists
	pass2 := append([]string{
		`No SHA256 specified in task mounts for artifact:` + taskID + `:public/build/unknown_issuer_app_1.zip - SHA256 from downloaded file .* is 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e.`,
		`Creating directory .*`,
		`Copying .* to .*file-located-here`,
	},
		granting...,
	)

	pass2 = append(pass2,
		`Found existing download for artifact:`+taskID+`:public/build/unknown_issuer_app_1.zip \(.*\) with correct SHA256 625554ec8ce731e486a5fb904f3331d18cf84a944dd9e40c19550686d4e8492e`,
		`Creating directory .*file-located-here`,
		// error is platform specific
		`(mkdir .*file-located-here: not a directory|mkdir .*file-located-here: The system cannot find the path specified.|cannot create directory .*file-located-here)`,
	)

	LogTest(
		&MountsLoggingTestCase{
			Test: t,
			Mounts: []MountEntry{
				&FileMount{
					File: "file-located-here",
					Content: json.RawMessage(`{
						"taskId":   "` + taskID + `",
						"artifact": "public/build/unknown_issuer_app_1.zip"
					}`),
				},
				&ReadOnlyDirectory{
					Directory: "file-located-here",
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

	setup(t)
	taskID := CreateArtifactFromFile(t, "unknown_issuer_app_1.zip", "public/build/unknown_issuer_app_1.zip")

	mounts := []MountEntry{
		&WritableDirectoryCache{
			CacheName: "unknown-issuer-app-cache",
			Directory: filepath.Join(t.Name(), "1"),
		},
		&ReadOnlyDirectory{
			Directory: filepath.Join(t.Name(), "2"),
			// SHA256 is intentionally incorrect to make sure that above cache is still persisted
			Content: json.RawMessage(`{
				"taskId": "` + taskID + `",
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
	defaults.SetDefaults(&payload)

	td := testTask(t)
	td.Dependencies = []string{
		taskID,
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
	defaults.SetDefaults(&payload)

	td = testTask(t)
	td.Scopes = []string{
		"generic-worker:cache:unknown-issuer-app-cache",
	}

	// check task succeeded, and worker didn't crash when trying to mount cache
	// (which can happen if it wasn't unmounted after first task failed)
	_ = submitAndAssert(t, td, payload, "completed", "completed")
}

func TestEvictNext(t *testing.T) {
	r := Resources(
		[]Resource{
			&Cache{
				Key: "apple",
			},
			&Cache{
				Key: "banana",
			},
			&Cache{
				Key: "pear",
			},
		},
	)
	err := r.EvictNext()
	if err != nil {
		t.Fatal(err)
	}
	if len(r) != 2 {
		t.Fatalf("Was expecting cache to have two entries (banana and pear), because apple should have been evicted; however cache has %v entries", len(r))
	}
	if key := r[0].(*Cache).Key; key != "banana" {
		t.Fatalf("Was expecting first cache item to be \"banana\" because \"apple\" should have been evicted, but it is %q", key)
	}
	if key := r[1].(*Cache).Key; key != "pear" {
		t.Fatalf("Was expecting second cache item to be \"pear\" because \"apple\" should have been evicted, but it is %q", key)
	}
}
