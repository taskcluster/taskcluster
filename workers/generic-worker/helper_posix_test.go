// +build darwin linux

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

func returnExitCode(exitCode uint) [][]string {
	return [][]string{
		{
			"/bin/bash",
			"-c",
			fmt.Sprintf("exit %d", exitCode),
		},
	}
}

func incrementCounterInCache() [][]string {
	return [][]string{
		{
			"/bin/bash",
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

func goEnv() [][]string {
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
			"/bin/bash",
			"-c",
			// don't use ping since that isn't available on travis-ci.org !
			fmt.Sprintf(`for ((i=0; i<%v; i++)); do echo $i; sleep 1; done > '%v'`, count, file),
		},
	}
}

func sleep(seconds uint) [][]string {
	return [][]string{
		{
			"sleep",
			strconv.Itoa(int(seconds)),
		},
	}
}

func goGet(packages ...string) [][]string {
	gg := []string{"go", "get"}
	return [][]string{append(gg, packages...)}
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
