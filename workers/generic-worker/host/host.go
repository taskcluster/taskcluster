// Package host provides facilities for interfacing with the host operating
// system, logging activities performed.
package host

import (
	"io"
	"log"
	"os/exec"
	"strings"

	"github.com/taskcluster/shell"
)

// Run is equivalent to exec.Command(name, arg...).Run() but with logging.
func Run(name string, arg ...string) (err error) {
	_, err = runCommand(exec.Command(name, arg...))
	return
}

// CombinedOutput is equivalent to exec.Command(name, arg...).CombinedOutput()
// but with logging.
func CombinedOutput(name string, arg ...string) (combinedOutput string, err error) {
	return runCommand(exec.Command(name, arg...))
}

// Output is like CombinedOutput but only returns Standard Out output. If an
// error is encountered, both standard error and standard output are logged.
func Output(name string, arg ...string) (string, error) {
	log.Printf("Running command: %s %s", shell.Escape(name), shell.Escape(arg...))

	cmd := exec.Command(name, arg...)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return "", err
	}

	if err := cmd.Start(); err != nil {
		return "", err
	}

	stdoutBytes, err := io.ReadAll(stdout)
	if err != nil {
		return "", err
	}
	stderrBytes, err := io.ReadAll(stderr)
	if err != nil {
		return "", err
	}

	if err := cmd.Wait(); err != nil {
		log.Printf("Error running command: %v", err)
		log.Printf("Standard output:\n%s", stdoutBytes)
		log.Printf("Standard error:\n%s", stderrBytes)
		return "", err
	}

	return string(stdoutBytes), nil
}

// RunBatch calls Run for each command in commands, in sequence. If allowFail
// is false it will return if an error is returned from Run. All errors are
// logged regardless of allowFail. The returned error is the result of the last
// Run call.
func RunBatch(allowFail bool, commands ...[]string) (err error) {
	for _, command := range commands {
		err = Run(command[0], command[1:]...)
		if err != nil {
			log.Printf("%v", err)
			if !allowFail {
				return err
			}
		}
	}
	return nil
}

// RunIgnoreError calls CombinedOutput(comand, args...). If errString is found
// in the command output, found is true and err is nil.  Otherwise found is
// false, and err is the error returned from CombinedOutput (possibly nil).
func RunIgnoreError(errString string, command string, args ...string) (found bool, err error) {
	output, err := CombinedOutput(command, args...)
	if err != nil {
		if strings.Contains(output, errString) {
			return true, nil
		}
	}
	return false, nil
}

// runCommand logs cmd.Args, calls cmd.CombinedOutput(), and if an error
// occurs, logs the command output. It does not log the error, it is expected
// that the caller takes care of logging error, if required. The caller is not
// expected to log the command output in the case of failure, since this
// function has already done that. The combined output is cast to a string and
// returned together with the error.
func runCommand(cmd *exec.Cmd) (combinedOutput string, err error) {
	log.Print("Running command: " + shell.Escape(cmd.Args...))
	out, err := cmd.CombinedOutput()
	if err != nil {
		log.Print("Error running command:")
		log.Print(string(out))
	}
	return string(out), nil
}
