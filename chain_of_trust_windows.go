package main

import (
	"fmt"
	"log"
	"time"

	"golang.org/x/sys/windows"

	acl "github.com/hectane/go-acl"
	"github.com/taskcluster/generic-worker/process"
)

func (cot *ChainOfTrustTaskFeature) ensureTaskUserCantReadPrivateCotKey() error {
	loginInfo, err := TaskUserLoginInfo()
	if err != nil {
		panic(fmt.Errorf("SERIOUS BUG: Could not get login info of task user to check it can't read chain of trust private key - %v", err))
	}
	TenSecondDeadline := time.Now().Add(time.Second * 10)
	c, err := process.NewCommand([]string{"cmd.exe", "/c", "type", config.SigningKeyLocation}, cwd, nil, loginInfo, TenSecondDeadline)
	if err != nil {
		panic(fmt.Errorf("SERIOUS BUG: Could not create command (not even trying to execute it yet) to cat private chain of trust key - %v", err))
	}
	r := c.Execute()
	if !r.Failed() {
		log.Print(r.String())
		return fmt.Errorf(ChainOfTrustKeyNotSecureMessage)
	}
	return nil
}

// Ensure only administrators have access permissions for the chain of trust
// private signing key file, and grant them full control.
func secureSigningKey() (err error) {
	err = acl.Apply(

		// Private signing key file
		config.SigningKeyLocation,
		// delete existing permissions (ACLs)
		true,
		// don't inherit permissions (ACLs)
		false,
		// grant Administrators group full control
		acl.GrantName(windows.GENERIC_ALL, "Administrators"),
	)
	return
}
