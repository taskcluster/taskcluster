// +build darwin,!docker linux,!docker freebsd

package main

import (
	"fmt"
)

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
			"/bin/bash",
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
