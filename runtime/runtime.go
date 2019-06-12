package runtime

import (
	"bytes"
	"errors"
	"log"
	"os"
	"os/exec"
	"strings"

	"github.com/dchest/uniuri"
	"github.com/taskcluster/shell"
)

// Runs command `command` with arguments `args`. If standard error from command
// includes `errString` then true, is returned with no error. Otherwise false
// is returned, with or without an error.
func AllowError(errString string, command string, args ...string) (bool, error) {
	log.Print("Running command: '" + strings.Join(append([]string{command}, args...), "' '") + "'")
	cmd := exec.Command(command, args...)
	stderrBytes, err := Error(cmd)
	if err != nil {
		if strings.Contains(string(stderrBytes), errString) {
			return true, nil
		}
	}
	return false, err
}

func RunCommands(allowFail bool, commands ...[]string) error {
	var err error
	for _, command := range commands {
		log.Print("Running command: '" + strings.Join(command, "' '") + "'")
		cmd := exec.Command(command[0], command[1:]...)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		err = cmd.Run()

		if err != nil {
			log.Printf("%v", err)
			if !allowFail {
				return err
			}
		}
	}
	return err
}

// Error runs the command and returns its standard error.
func Error(c *exec.Cmd) ([]byte, error) {
	if c.Stderr != nil {
		return nil, errors.New("exec: Stderr already set")
	}
	var b bytes.Buffer
	c.Stderr = &b
	err := c.Run()
	return b.Bytes(), err
}

func ProcessCommandOutput(lineEnding string, callback func(line string), prog string, options ...string) error {
	out, err := exec.Command(prog, options...).Output()
	if err != nil {
		log.Printf("%v", err)
		return err
	}
	for _, line := range strings.Split(string(out), lineEnding) {
		trimmedLine := strings.Trim(line, lineEnding+" ")
		callback(trimmedLine)
	}
	return nil
}

// Uses [A-Za-z0-9] characters (default set) to avoid strange escaping problems
// that could potentially affect security. Prefixed with `pWd0_` to ensure
// password contains a special character (_), lowercase and uppercase letters,
// and a number. This is useful if the OS has a strict password policy
// requiring all of these. The total password length is 29 characters (24 of
// which are random). 29 characters should not be too long for the OS. The 24
// random characters of [A-Za-z0-9] provide (26+26+10)^24 possible permutations
// (approx 143 bits of randomness). Randomisation is not seeded, so results
// should not be reproducible.
func GeneratePassword() string {
	return "pWd0_" + uniuri.NewLen(24)
}

func CommandOutputOrPanic(command string, args ...string) string {
	logMessage := "Running " + shell.Escape(command)
	if len(args) > 0 {
		logMessage += " " + shell.Escape(args...)
	}
	log.Print(logMessage)
	output, err := exec.Command(command, args...).Output()
	if err != nil {
		panic(err)
	}
	return strings.TrimSpace(string(output))
}
