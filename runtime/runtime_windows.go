package runtime

import (
	"fmt"
	"log"
)

type OSUser struct {
	Name     string
	Password string
}

func (user *OSUser) Create(okIfExists bool) error {
	log.Print("Creating Windows user " + user.Name + "...")
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
	log.Print("Created new OS user!")
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

func (user *OSUser) MakeAdmin() error {
	_, err := AllowError("The specified account name is already a member of the group", "net", "localgroup", "administrators", user.Name, "/add")
	return err
}
