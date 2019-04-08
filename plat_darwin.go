package main

import (
	"io/ioutil"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/dchest/uniuri"
	"github.com/taskcluster/generic-worker/runtime"
)

func createNewTaskContext() error {
	// username can only be 20 chars, uuids are too long, therefore
	// use prefix (5 chars) plus seconds since epoch (10 chars)
	userName := "task_" + strconv.Itoa(int(time.Now().Unix()))
	password := generatePassword()
	taskContext = &TaskContext{
		TaskDir: "/Users/" + userName,
		User: &runtime.OSUser{
			Name:     userName,
			Password: password,
		},
	}
	err := taskContext.User.Create(false)
	if err != nil {
		return err
	}
	// store password
	err = ioutil.WriteFile(filepath.Join(taskContext.TaskDir, "_Passw0rd"), []byte(taskContext.User.Password), 0666)
	if err != nil {
		return err
	}
	return os.MkdirAll(filepath.Join(taskContext.TaskDir, filepath.Dir(logPath)), 0777)
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
func generatePassword() string {
	return "pWd0_" + uniuri.NewLen(24)
}
