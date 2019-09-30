package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

func helloGoodbye() []string {
	return []string{
		"echo hello world!",
		"echo goodbye world!",
	}
}

func rawHelloGoodbye() string {
	return `"echo hello world!", "echo goodbye world!"`
}

func checkSHASums() []string {
	return []string{
		"PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File preloaded\\check-shasums.ps1",
	}
}

func returnExitCode(exitCode uint) []string {
	return []string{
		fmt.Sprintf("exit %d", exitCode),
	}
}

func incrementCounterInCache() []string {
	// The `echo | set /p dummyName...` construction is to avoid printing a
	// newline. See answer by xmechanix on:
	// http://stackoverflow.com/questions/7105433/windows-batch-echo-without-new-line/19468559#19468559
	command := `
		setlocal EnableDelayedExpansion
		if exist my-task-caches\test-modifications\counter (
		  set /p counter=<my-task-caches\test-modifications\counter
		  set /a counter=counter+1
		  echo | set /p dummyName="!counter!" > my-task-caches\test-modifications\counter
		) else (
		  echo | set /p dummyName="1" > my-task-caches\test-modifications\counter
		)
`
	return []string{command}
}

func goEnv() []string {
	return []string{
		"go env",
		"set",
		"where go",
		"go version",
	}
}

func logOncePerSecond(count uint, file string) []string {
	return goRunFileOutput(file, "spawn-orphan-process.go", strconv.Itoa(int(count)))
	// return []string{
	// 	"ping 127.0.0.1 -n " + strconv.Itoa(int(count)) + " > " + file,
	// }
}

func sleep(seconds uint) []string {
	return []string{
		"ping 127.0.0.1 -n " + strconv.Itoa(int(seconds+1)) + " > nul",
	}
}

func goGet(packages ...string) []string {
	return []string{"go get " + strings.Join(packages, " ")}
}

func goRun(goFile string, args ...string) []string {
	return goRunFileOutput("", goFile, args...)
}

func goRunFileOutput(output, goFile string, args ...string) []string {
	prepare := []string{}
	for _, envVar := range []string{
		"PATH", "GOPATH", "GOROOT",
	} {
		if val, exists := os.LookupEnv(envVar); exists {
			prepare = append(prepare, "set "+envVar+"="+val)
		}
	}
	prepare = append(prepare, copyTestdataFile(goFile)...)
	command := []string{`"` + goFile + `"`}
	commandWithArgs := append(command, args...)
	run := `go run ` + strings.Join(commandWithArgs, ` `)
	if output != "" {
		run += " > " + output
	}
	return append(prepare, run)
}

func copyTestdataFile(path string) []string {
	return copyTestdataFileTo(path, path)
}

func copyTestdataFileTo(src, dest string) []string {
	destFile := strings.Replace(dest, "/", "\\", -1)
	sourceFile := filepath.Join(testdataDir, strings.Replace(src, "/", "\\", -1))
	return []string{
		"if not exist \"" + filepath.Dir(destFile) + "\" mkdir \"" + filepath.Dir(destFile) + "\"",
		"copy \"" + sourceFile + "\" \"" + destFile + "\"",
	}
}

func singleCommandNoArgs(command string) []string {
	return []string{command}
}
