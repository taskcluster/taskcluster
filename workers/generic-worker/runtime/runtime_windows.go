package runtime

import (
	"fmt"
	"log"
	"os/user"
	"strings"
	"syscall"
	"time"

	"github.com/taskcluster/taskcluster/v46/workers/generic-worker/host"
	"github.com/taskcluster/taskcluster/v46/workers/generic-worker/win32"
	"golang.org/x/sys/windows/registry"
)

type OSUser struct {
	Name     string `json:"name"`
	Password string `json:"password"`
}

func (user *OSUser) CreateNew(okIfExists bool) error {
	log.Print("Creating Windows user " + user.Name + "...")
	userExisted, err := host.RunIgnoreError(
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
	err = host.RunBatch(
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
	_, err := host.RunIgnoreError("The specified account name is already a member of the group", "net", "localgroup", "administrators", user.Name, "/add")
	return err
}

func DeleteUser(username string) (err error) {
	var u *user.User
	u, err = user.Lookup(username)
	if err == nil {
		var userSID *uint16
		userSID, err = syscall.UTF16PtrFromString(u.Uid)
		if err == nil {
			err = win32.DeleteProfile(userSID, nil, nil)
			if err == nil {
				log.Printf("Successfully deleted profile for user %v (SID %v)", username, u.Uid)
			} else {
				log.Printf("WARNING: not able to delete profile for user %v (SID %v): %v", username, u.Uid, err)
			}
		} else {
			log.Printf("WARNING: not able to convert SID %v to UTF16 pointer so could not delete user profile for %v: %v", u.Uid, username, err)
		}
	} else {
		log.Printf("WARNING: not able to look up SID for user %v: %v", username, err)
	}
	err2 := host.Run("net", "user", username, "/delete")
	if err2 != nil {
		log.Printf("WARNING: not able to delete user account %v: %v", username, err2)
		if err == nil {
			err = err2
		}
	}
	return
}

func ListUserAccounts() (usernames []string, err error) {
	var out string
	out, err = host.CombinedOutput("wmic", "useraccount", "get", "name")
	if err != nil {
		return
	}
	for _, line := range strings.Split(out, "\r\n") {
		trimmedLine := strings.Trim(line, "\r\n ")
		usernames = append(usernames, trimmedLine)
	}
	return
}

func UserHomeDirectoriesParent() string {
	return win32.ProfilesDirectory()
}

func WaitForLoginCompletion(timeout time.Duration) error {
	_, err := win32.InteractiveUserToken(timeout)
	return err
}

func InteractiveUsername() (string, error) {
	userToken, err := win32.InteractiveUserToken(time.Minute * 3)
	if err != nil {
		return "", err
	}
	tokenUser, err := userToken.GetTokenUser()
	if err != nil {
		panic(err)
	}
	account, _, _, err := tokenUser.User.Sid.LookupAccount("")
	if err != nil {
		panic(err)
	}
	return account, nil
}

func AutoLogonUser() (username string) {
	// Set flag registry.WOW64_64KEY since Windows 10 ARM machines will otherwise read from:
	// HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows NT\CurrentVersion\Winlogon
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon`, registry.QUERY_VALUE|registry.WOW64_64KEY)
	if err != nil {
		log.Printf("Hit error reading Winlogon registry key - assume no autologon set: %v", err)
		return
	}
	defer k.Close()
	username, _, err = k.GetStringValue("DefaultUserName")
	if err != nil {
		log.Printf("Hit error reading winlogon DefaultUserName registry value - assume no autologon set: %v", err)
		return
	}
	return
}

func SetAutoLogin(user *OSUser) error {
	// Set flag registry.WOW64_64KEY since Windows 10 ARM machines will otherwise write to:
	// HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows NT\CurrentVersion\Winlogon
	k, _, err := registry.CreateKey(registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon`, registry.WRITE|registry.WOW64_64KEY)
	if err != nil {
		return fmt.Errorf(`Was not able to create registry key 'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' due to %s`, err)
	}
	defer k.Close()
	err = k.SetDWordValue("AutoAdminLogon", 1)
	if err != nil {
		return fmt.Errorf(`Was not able to set registry entry 'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\AutoAdminLogon' to 1 due to %s`, err)
	}
	err = k.SetStringValue("DefaultUserName", user.Name)
	if err != nil {
		return fmt.Errorf(`Was not able to set registry entry 'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\DefaultUserName' to %q due to %s`, user.Name, err)
	}
	err = k.SetStringValue("DefaultPassword", user.Password)
	if err != nil {
		return fmt.Errorf(`Was not able to set registry entry 'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\DefaultPassword' to %q due to %s`, user.Password, err)
	}
	return nil
}
