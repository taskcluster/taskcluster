package main

import (
	"fmt"
	"log"

	"github.com/taskcluster/generic-worker/process"
)

func (cot *ChainOfTrustTaskFeature) ensureTaskUserCantReadPrivateCotKey() error {
	accessToken := cot.task.PlatformData.CommandAccessToken
	signingKeyPaths := [2]string{
		config.OpenPGPSigningKeyLocation,
		config.Ed25519SigningKeyLocation,
	}
	for _, path := range signingKeyPaths {
		c, err := process.NewCommand([]string{"cmd.exe", "/c", "type", path}, cwd, nil, accessToken)
		if err != nil {
			panic(fmt.Errorf("SERIOUS BUG: Could not create command (not even trying to execute it yet) to cat private chain of trust key %v - %v", path, err))
		}
		r := c.Execute()
		if !r.Failed() {
			log.Print(r.String())
			return fmt.Errorf(ChainOfTrustKeyNotSecureMessage)
		}
	}
	return nil
}
