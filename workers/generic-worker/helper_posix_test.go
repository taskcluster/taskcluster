//go:build darwin || linux || freebsd

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// makeDirWorldWritable makes a directory writable by any user, so that
// the multiuser engine task user can write to it. On posix this is a
// simple chmod 0777.
func makeDirWorldWritable(t *testing.T, dir string) {
	t.Helper()
	err := os.Chmod(dir, 0777)
	if err != nil {
		t.Fatalf("Failed to chmod %s: %v", dir, err)
	}
}

// worldWritableTempDir creates a temporary directory that any user
// can write to. On posix, /tmp is world-writable so os.MkdirTemp
// works directly, and we chmod 0777 the result.
func worldWritableTempDir(t *testing.T, pattern string) string {
	t.Helper()
	// In Docker, /tmp may be on a different filesystem than the source mount,
	// causing cross-device rename failures when persisting caches. Use a temp
	// dir on the same filesystem as the worker directory instead.
	tmpBase := ""
	if os.Getenv("GW_IN_DOCKER") == "1" {
		tmpBase = filepath.Join(cwd, ".tmp-test")
		if err := os.MkdirAll(tmpBase, 0777); err != nil {
			t.Fatalf("Failed to create temp base dir: %v", err)
		}
	}
	dir, err := os.MkdirTemp(tmpBase, pattern)
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	t.Cleanup(func() {
		os.RemoveAll(dir)
	})
	makeDirWorldWritable(t, dir)
	return dir
}

func helloGoodbye() [][]string {
	return [][]string{
		{
			"echo",
			"hello world!",
		},
		{
			"echo",
			"goodbye world!",
		},
	}
}

func rawHelloGoodbye() string {
	return `["echo", "hello world!"], ["echo", "goodbye world!"]`
}

func printFileContents(path string) [][]string {
	return [][]string{
		{
			"cat",
			path,
		},
	}
}

func returnExitCode(exitCode uint) [][]string {
	return [][]string{
		{
			"/usr/bin/env",
			"bash",
			"-c",
			fmt.Sprintf("exit %d", exitCode),
		},
	}
}

func copyTestdataFile(path string) [][]string {
	return copyTestdataFileTo(path, path)
}

func copyTestdataFileTo(src, dest string) [][]string {
	sourcePath := filepath.Join(testdataDir, src)
	return [][]string{
		{
			"mkdir",
			"-p",
			filepath.Dir(dest),
		},
		{
			"cp",
			sourcePath,
			dest,
		},
	}
}

func singleCommandNoArgs(command string) [][]string {
	return [][]string{{command}}
}

func checkSHASums() [][]string {
	return [][]string{
		{
			"chmod",
			"u+x",
			"preloaded/check-shasums.sh",
		},
		{
			"preloaded/check-shasums.sh",
		},
	}
}

func incrementCounterInCacheDir(dir string) [][]string {
	return [][]string{
		{
			"/usr/bin/env",
			"bash",
			"-c",
			fmt.Sprintf(`if [ ! -f "%s/counter" ]; then
			  echo -n '1' > "%s/counter"
			else
              let x=$(cat "%s/counter")+1
			  echo -n "${x}" > "%s/counter"
			fi`, dir, dir, dir, dir),
		},
	}
}

func GoEnv() [][]string {
	return [][]string{
		{
			"go",
			"env",
		},
		{
			"env",
		},
		{
			"which",
			"go",
		},
		{
			"go",
			"version",
		},
	}
}

func logOncePerSecond(count uint, file string) [][]string {
	return [][]string{
		{
			"/usr/bin/env",
			"bash",
			"-c",
			// don't use ping since that isn't available on travis-ci.org !
			fmt.Sprintf(`for ((i=0; i<%v; i++)); do echo $i; sleep 1; done > '%v'`, count, file),
		},
	}
}

func goRun(goFile string, args ...string) [][]string {
	copy := copyTestdataFile(goFile)
	run := []string{
		"go",
		"run",
		goFile,
	}
	runWithArgs := append(run, args...)
	return append(copy, runWithArgs)
}

func sleep(seconds uint) [][]string {
	return [][]string{
		{
			"sleep",
			strconv.Itoa(int(seconds)),
		},
	}
}

func listGroups() [][]string {
	return [][]string{
		{
			"bash",
			"-ce",
			strings.Join(
				[]string{
					`# make sure listing groups fails if process does not have same permissions as user`,
					`if [ "$(id -nG)" != "$(id -nG $(whoami))" ]; then`,
					`  echo 'Process groups'`,
					`  echo '=============='`,
					`  id -nG`,
					`  echo`,
					`  echo 'User groups'`,
					`  echo '==========='`,
					`  id -nG $(whoami)`,
					`  echo`,
					`  echo 'These are different, but should be the same'`,
					`  exit 1`,
					`fi`,
					`for group in $(id -nG); do`,
					`  echo "*${group}"`,
					`done`,
				},
				"\n",
			),
		},
	}
}
