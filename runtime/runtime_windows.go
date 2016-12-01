package runtime

import (
	"bytes"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"
)

type OSUser struct {
	Name     string
	Password string
}

func (user *OSUser) EnsureCreated() error {
	return user.Create(true)
}

func (user *OSUser) CreateNew() error {
	return user.Create(false)
}

func (user *OSUser) Create(okIfExists bool) error {
	log.Print("Creating Windows User " + user.Name + "...")
	userExisted, err := AllowError(
		"The account already exists",
		"net", "user", user.Name, user.Password, "/add", "/expires:never", "/passwordchg:no", "/y",
	)
	if err != nil {
		return err
	}
	if !okIfExists && userExisted {
		return fmt.Errorf("User " + user.Name + " already existed - cannot create")
	}
	err = RunCommands(
		userExisted,
		[]string{"wmic", "useraccount", "where", "name='" + user.Name + "'", "set", "passwordexpires=false"},
		[]string{"net", "localgroup", "Remote Desktop Users", "/add", user.Name},
	)
	// if user existed, the above commands can fail
	// if it didn't, they can't
	if !userExisted && err != nil {
		return err
	}
	if okIfExists {
		return nil
	}
	return err
}

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

func (user *OSUser) MakeAdmin() error {
	_, err := AllowError("The specified account name is already a member of the group", "net", "localgroup", "administrators", user.Name, "/add")
	return err
}
