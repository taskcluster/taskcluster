// +build darwin linux freebsd

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
			"/bin/bash",
			"-c",
			fmt.Sprintf("exit %d", exitCode),
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
