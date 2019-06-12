// +build multiuser

package main

import (
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/taskcluster/slugid-go/slugid"
)

// grantingDenying returns regexp strings that match the log lines for granting
// and denying a task user access to a file/folder (specified by taskPath).
// filetype should be 'directory' or 'file'.
func grantingDenying(t *testing.T, filetype string, taskPath ...string) (granting, denying []string) {
	// We need to escape file path that is contained in final regexp, e.g. due
	// to '\' path separator on Windows. However, the path also includes an
	// unknown task user (task_[0-9]*) which we don't want to escape. The
	// simplest way to properly escape the expression but without escaping this
	// one part of it, is to swap out the task user expression with a randomly
	// generated slugid (122 bits of randomness) which doesn't contain
	// characters that need escaping, then to escape the full expression, and
	// finally to replace the swapped in slug with the desired regexp that we
	// couldn't include before escaping.
	slug := slugid.V4()
	pathRegExp := strings.Replace(regexp.QuoteMeta(filepath.Join(testdataDir, t.Name(), slug, filepath.Join(taskPath...))), slug, "task_[0-9]*", -1)
	return []string{
			`Granting task_[0-9]* full control of ` + filetype + ` '` + pathRegExp + `'`,
		}, []string{
			`Denying task_[0-9]* access to '.*'`,
		}
}

func setConfigRunTasksAsCurrentUser() {
	config.RunTasksAsCurrentUser = os.Getenv("GW_TESTS_RUN_AS_TASK_USER") == ""
}

func EngineTestSettings(settings map[string]interface{}) {
	settings["runTasksAsCurrentUser"] = os.Getenv("GW_TESTS_RUN_AS_TASK_USER") == ""
}

// TestMissingDependency tests that if artifact content is mounted, it must be included as a task dependency
func TestWhoAmI(t *testing.T) {
	defer setup(t)()

	payload := GenericWorkerPayload{
		Command:    goRun("whoami.go", strconv.FormatBool(config.RunTasksAsCurrentUser)),
		MaxRunTime: 30,
	}

	td := testTask(t)

	_ = submitAndAssert(t, td, payload, "completed", "completed")
}
