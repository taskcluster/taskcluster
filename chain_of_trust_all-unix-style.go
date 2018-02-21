// +build !windows

package main

import (
	"fmt"
	"os"
	"os/user"
	"strconv"

	"github.com/taskcluster/generic-worker/process"
)

func (cot *ChainOfTrustTaskFeature) ensureTaskUserCantReadPrivateCotKey() error {
	c, err := process.NewCommand([]string{"/bin/cat", config.SigningKeyLocation}, cwd, cot.task.EnvVars())
	if err != nil {
		panic(fmt.Errorf("SERIOUS BUG: Could not create command (not even trying to execute it yet) to cat private chain of trust key - %v", err))
	}
	r := c.Execute()
	if !r.Failed() {
		return fmt.Errorf(ChainOfTrustKeyNotSecureMessage)
	}
	return nil
}

// Take ownership of private signing key, and then give it 0600 file permissions
func secureSigningKey() (err error) {
	var currentUser *user.User
	currentUser, err = user.Current()
	if err != nil {
		return err
	}
	var uid, gid int
	uid, err = strconv.Atoi(currentUser.Uid)
	if err != nil {
		return err
	}
	gid, err = strconv.Atoi(currentUser.Gid)
	if err != nil {
		return err
	}
	err = os.Chown(
		config.SigningKeyLocation,
		uid,
		gid,
	)
	if err != nil {
		return err
	}
	err = os.Chmod(
		config.SigningKeyLocation,
		0600,
	)
	return
}
