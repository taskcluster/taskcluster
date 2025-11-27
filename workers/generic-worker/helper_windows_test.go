package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"

	"github.com/taskcluster/taskcluster/v94/workers/generic-worker/win32"
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

func printFileContents(path string) []string {
	return []string{
		fmt.Sprintf("type %s", path),
	}
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

func GoEnv() []string {
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

func goRun(goFile string, args ...string) []string {
	return goRunFileOutput("", goFile, args...)
}

func goRunFileOutput(outputFile, goFile string, args ...string) []string {
	prepare := []string{}
	for _, envVar := range []string{
		"PATH", "GOPATH", "GOROOT",
	} {
		if val, exists := os.LookupEnv(envVar); exists {
			prepare = append(prepare, "set "+envVar+"="+win32.CMDExeEscape(val))
		}
	}
	prepare = append(prepare, copyTestdataFile(goFile)...)

	cmd := []string{"go", "run", goFile}
	cmd = append(cmd, args...)

	return append(prepare, run(cmd, outputFile))
}

// run runs the command line args specified in args and redirects the output to
// file outputFile if it is not an empty string.
func run(args []string, outputFile string) string {
	// Goddammit, Windows! Even this double nesting doesn't work sometimes. See
	// the testdata/curlget.go program - the url needed to be base64 encoded
	// since the escaping still wasn't sufficient.
	//
	// Explanation:
	//
	//   https://blogs.msdn.microsoft.com/twistylittlepassagesallalike/2011/04/23/everyone-quotes-command-line-arguments-the-wrong-way/
	//
	// The problem seems to be because we generate a bash script that calls
	// another bash script, and I think something funky is going on when a
	// `call` is issued inside bash, that the previous guide doesn't cover.
	// There is some information here, which suggests replacing all % with %%,
	// but although that solved the issue with the curlget test failure
	// (TestTaskclusterProxy), it broke another that checks that env vars with
	// funky characters can be properly encoded (TestWorkerLocation):
	//
	//   https://www.robvanderwoude.com/files/testcallescapedstring_nt.txt
	//
	// So I've base64 encoded the URL arg of testdata/curlget.go, and leave
	// this as it is for now, until we have a better idea what might be the
	// perfect escaping sequence in the general case.
	run := win32.CMDExeEscape(makeCmdLine(args))

	if outputFile != "" {
		run += ` > ` + syscall.EscapeArg(outputFile)
	}
	return run
}

// makeCmdLine builds a command line that can be passed to CreateProcess family of syscalls.
func makeCmdLine(args []string) string {
	var s string
	for _, v := range args {
		if s != "" {
			s += " "
		}
		s += syscall.EscapeArg(v)
	}
	return s
}

func copyTestdataFile(path string) []string {
	return copyTestdataFileTo(path, path)
}

func copyTestdataFileTo(src, dest string) []string {
	destFile := strings.ReplaceAll(dest, "/", "\\")
	sourceFile := filepath.Join(testdataDir, strings.ReplaceAll(src, "/", "\\"))
	return []string{
		run([]string{"if", "not", "exist", filepath.Dir(destFile), "mkdir", filepath.Dir(destFile)}, ""),
		run([]string{"copy", sourceFile, destFile}, ""),
	}
}

func singleCommandNoArgs(command string) []string {
	return []string{command}
}

func listGroups() []string {
	return []string{
		`net localgroup`,
	}
}
