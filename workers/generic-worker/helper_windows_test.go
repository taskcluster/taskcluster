package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
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
	cmd := []string{"go", "get"}
	cmd = append(cmd, packages...)
	return []string{run(cmd, "")}
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
			prepare = append(prepare, "set "+envVar+"="+val)
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
	run := cmdExeEscape(makeCmdLine(args))

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

// cmdExeEscape escapes cmd.exe metacharacters
// See: https://blogs.msdn.microsoft.com/twistylittlepassagesallalike/2011/04/23/everyone-quotes-command-line-arguments-the-wrong-way/
func cmdExeEscape(text string) string {
	cmdEscaped := ""
	for _, c := range text {
		if strings.ContainsRune(`()%!^"<>&|`, c) {
			cmdEscaped += "^"
		}
		cmdEscaped += string(c)
	}
	return cmdEscaped
}

func copyTestdataFile(path string) []string {
	return copyTestdataFileTo(path, path)
}

func copyTestdataFileTo(src, dest string) []string {
	destFile := strings.Replace(dest, "/", "\\", -1)
	sourceFile := filepath.Join(testdataDir, strings.Replace(src, "/", "\\", -1))
	return []string{
		run([]string{"if", "not", "exist", filepath.Dir(destFile), "mkdir", filepath.Dir(destFile)}, ""),
		run([]string{"copy", sourceFile, destFile}, ""),
	}
}

func singleCommandNoArgs(command string) []string {
	return []string{command}
}
