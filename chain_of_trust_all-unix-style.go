// +build !windows

package main

import (
	"fmt"

	"github.com/taskcluster/generic-worker/process"
)

func (cot *ChainOfTrustTaskFeature) ensureTaskUserCantReadPrivateCotKey() error {
	signingKeyPaths := [2]string{
		config.Ed25519SigningKeyLocation,
	}
	for _, path := range signingKeyPaths {
		c, err := process.NewCommand([]string{"/bin/cat", path}, cwd, cot.task.EnvVars())
		if err != nil {
			panic(fmt.Errorf("SERIOUS BUG: Could not create command (not even trying to execute it yet) to cat private chain of trust key %v - %v", path, err))
		}
		r := c.Execute()
		if !r.Failed() {
			return fmt.Errorf(ChainOfTrustKeyNotSecureMessage)
		}
	}
	return nil
}
