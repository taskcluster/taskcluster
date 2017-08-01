// +build !windows

package main

import (
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
	return `"command": [
    [
      "echo",
      "hello world!"
    ],
    [
      "echo",
      "goodbye world!"
    ]
  ]`
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

func failCommand() [][]string {
	return [][]string{
		{
			"false",
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

func sleep(seconds uint) [][]string {
	return [][]string{
		{
			"sleep",
			strconv.Itoa(int(seconds)),
		},
	}
}

func goRun(goFile string) [][]string {
	return [][]string{
		{
			"go",
			"run",
			goFile,
		},
	}
}

func copyArtifact(path string) [][]string {
	return copyArtifactTo(path, path)
}

func copyArtifactTo(src, dest string) [][]string {
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
