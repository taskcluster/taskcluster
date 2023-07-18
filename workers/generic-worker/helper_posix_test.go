//go:build darwin || linux || freebsd

package main

import (
	"fmt"
	"path/filepath"
	"strconv"
)

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

func incrementCounterInCache() [][]string {
	return [][]string{
		{
			"/usr/bin/env",
			"bash",
			"-c",
			`if [ ! -f "my-task-caches/test-modifications/counter" ]; then
			  echo -n '1' > "my-task-caches/test-modifications/counter"
			else
              let x=$(cat "my-task-caches/test-modifications/counter")+1
			  echo -n "${x}" > "my-task-caches/test-modifications/counter"
			fi`,
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
			"-c",
			`USER="$(whoami)"; for group in $(id -nG "${USER}"); do echo "*${group}"; done`,
		},
	}
}
