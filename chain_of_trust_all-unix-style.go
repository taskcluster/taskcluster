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
	signingKeyPaths := [2]string{
		config.OpenpgpSigningKeyLocation,
		config.Ed25519SigningKeyLocation,
	}
	for _, path := range signingKeyPaths {
		c, err := process.NewCommand([]string{"/bin/cat", path, cwd, cot.task.EnvVars())
		if err != nil {
			panic(fmt.Errorf("SERIOUS BUG: Could not create command (not even trying to execute it yet) to cat private chain of trust key - %v", err))
		}
		r := c.Execute()
		if !r.Failed() {
			return fmt.Errorf(ChainOfTrustKeyNotSecureMessage)
		}
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
	signingKeyPaths := [2]string{
		config.OpenpgpSigningKeyLocation,
		config.Ed25519SigningKeyLocation,
	}
	for _, path := range signingKeyPaths {
		err = os.Chown(
			path,
			uid,
			gid,
		)
		if err != nil {
			return err
		}
		err = os.Chmod(
			path,
			0600,
		)
		if err != nil {
			return err
		}
	}
	return
}
