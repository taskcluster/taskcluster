// Package host provides facilities for interfacing with the host operating
// system, logging activities performed.
package host

import (
	"log"
	"os/exec"
	"strings"

	"github.com/taskcluster/shell"
)

// Run is equivalent to exec.Command(name, arg...).Run() but with logging.
func Run(name string, arg ...string) (err error) {
	_, err = RunCommand(exec.Command(name, arg...))
	return
}

// CombinedOutput is equivalent to exec.Command(name, arg...).CombinedOutput()
// but with logging.
func CombinedOutput(name string, arg ...string) (combinedOutput string, err error) {
	return RunCommand(exec.Command(name, arg...))
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
	return err
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
	return false, err
}

// RunCommand logs cmd.Args, calls cmd.CombinedOutput(), and if an error
// occurs, logs the command output. It does not log the error, it is expected
// that the caller takes care of logging error, if required. The caller is not
// expected to log the command output in the case of failure, since this
// function has already done that. The combined output is cast to a string and
// returned together with the error.
func RunCommand(cmd *exec.Cmd) (combinedOutput string, err error) {
	log.Print("Running command: " + shell.Escape(cmd.Args...))
	out, err := cmd.CombinedOutput()
	if err != nil {
		log.Print("Error running command:")
		log.Print(string(out))
	}
	return string(out), err
}
