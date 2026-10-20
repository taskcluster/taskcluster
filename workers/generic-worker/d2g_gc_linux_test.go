package main

import (
	"math"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/taskcluster/taskcluster/v113/workers/generic-worker/gwconfig"
)

const unreachableMB = math.MaxUint32

// setupFakeDocker enables D2G and puts a fake docker on PATH that reports
// dataRoot as its data-root, or fails `docker info` if dataRoot is empty. It
// returns a function listing the docker subcommands run so far.
func setupFakeDocker(t *testing.T, dataRoot string) func() []string {
	t.Helper()
	origConfig, origDockerRootDir, origDockerRootDirLookup := config, dockerRootDir, dockerRootDirLookup
	t.Cleanup(func() {
		config, dockerRootDir, dockerRootDirLookup = origConfig, origDockerRootDir, origDockerRootDirLookup
	})
	config = &gwconfig.Config{}
	config.TasksDir = t.TempDir()
	config.EnableD2G(t)
	dockerRootDir, dockerRootDirLookup = "", time.Time{}

	binDir := t.TempDir()
	callLog := filepath.Join(binDir, "calls")
	info := `[ "$1" = info ] && exit 1`
	if dataRoot != "" {
		info = `[ "$1" = info ] && echo '` + dataRoot + `'`
	}
	script := "#!/bin/sh\necho \"$1\" >> '" + callLog + "'\n" + info + "\nexit 0\n"
	if err := os.WriteFile(filepath.Join(binDir, "docker"), []byte(script), 0755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))

	// removeD2GCacheFile removes d2g-image-cache.json from the working directory
	t.Chdir(t.TempDir())
	if err := os.WriteFile("d2g-image-cache.json", []byte("{}"), 0644); err != nil {
		t.Fatal(err)
	}

	return func() []string {
		data, err := os.ReadFile(callLog)
		if err != nil && !os.IsNotExist(err) {
			t.Fatal(err)
		}
		return strings.Fields(string(data))
	}
}

func TestDockerGarbageCollection(t *testing.T) {
	for _, tc := range []struct {
		name             string
		dataRoot         string
		requiredMB       uint
		requiredDockerMB uint
		pruned           bool
	}{
		{"enough space", t.TempDir(), 1, 1, false},
		{"only tasksDir low on space", t.TempDir(), unreachableMB, 1, false},
		{"docker data-root low on space", t.TempDir(), 1, unreachableMB, true},
		{"docker threshold defaults to requiredDiskSpaceMegabytes", t.TempDir(), unreachableMB, 0, true},
		{"docker info fails and tasksDir low on space", "", unreachableMB, 1, true},
		{"docker info fails and tasksDir not low on space", "", 1, unreachableMB, false},
		{"docker data-root missing", "/does/not/exist", 1, unreachableMB, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := setupFakeDocker(t, tc.dataRoot)
			config.RequiredDiskSpaceMegabytes = tc.requiredMB
			config.RequiredDockerDiskSpaceMegabytes = tc.requiredDockerMB

			if err := runGarbageCollection(nil, false); err != nil {
				t.Fatal(err)
			}
			expected := []string{"info"}
			if tc.pruned {
				expected = append(expected, "volume", "system")
			}
			if got := calls(); !slices.Equal(got, expected) {
				t.Errorf("Expected docker calls %q, got %q", expected, got)
			}
			if _, err := os.Stat("d2g-image-cache.json"); tc.pruned != os.IsNotExist(err) {
				t.Errorf("Expected d2g-image-cache.json removed to be %v, stat gave: %v", tc.pruned, err)
			}
		})
	}
}

func TestDockerRootDirLookup(t *testing.T) {
	for _, dataRoot := range []string{t.TempDir(), ""} {
		calls := setupFakeDocker(t, dataRoot)
		config.RequiredDiskSpaceMegabytes = 1
		dockerLowOnSpace()
		dockerLowOnSpace()
		if got := calls(); !slices.Equal(got, []string{"info"}) {
			t.Errorf("Expected docker info to run once for data-root %q, got %q", dataRoot, got)
		}
		if dockerRootDir != dataRoot {
			t.Errorf("Expected docker data-root %q, got %q", dataRoot, dockerRootDir)
		}

		dockerRootDirLookup = dockerRootDirLookup.Add(-time.Minute)
		dockerLowOnSpace()
		expected := []string{"info"}
		if dataRoot == "" {
			expected = append(expected, "info")
		}
		if got := calls(); !slices.Equal(got, expected) {
			t.Errorf("Expected docker calls %q a minute later for data-root %q, got %q", expected, dataRoot, got)
		}
	}
}

func TestDockerGarbageCollectionSkippedWhileTasksRunning(t *testing.T) {
	calls := setupFakeDocker(t, t.TempDir())
	config.RequiredDockerDiskSpaceMegabytes = unreachableMB

	if err := runGarbageCollection(nil, true); err != nil {
		t.Fatal(err)
	}
	if got := calls(); len(got) != 0 {
		t.Errorf("Expected no docker calls, got %q", got)
	}
}
