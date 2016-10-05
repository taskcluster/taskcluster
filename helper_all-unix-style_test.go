// +build !windows

package main

import (
	"fmt"
	"strconv"
	"strings"
	"testing"
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

func checkGroupsAdded(t *testing.T, groups []string, logtext string) {
	substring := fmt.Sprintf("Not adding user  to groups %v", groups)
	if !strings.Contains(logtext, substring) {
		t.Logf("Was expecting log to contain string %v", substring)
		t.Fatalf("Actual log was:\n%v", logtext)
	}
}
