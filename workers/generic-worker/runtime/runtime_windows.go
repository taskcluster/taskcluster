package runtime

import (
	"fmt"
	"log"
	"os/user"
	"strings"
	"syscall"
	"time"

	"github.com/taskcluster/taskcluster/v92/workers/generic-worker/host"
	"github.com/taskcluster/taskcluster/v92/workers/generic-worker/win32"
	"golang.org/x/sys/windows/registry"
)

type OSUser struct {
	Name     string `json:"name"`
	Password string `json:"password"`
}

func (user *OSUser) CreateNew(okIfExists bool) error {
	log.Print("Creating Windows user " + user.Name + "...")
	userExisted, err := host.RunIgnoreError(
		"User "+user.Name+" already exists",
		"powershell", "-Command", "New-LocalUser -Name '"+user.Name+"' -Password (ConvertTo-SecureString '"+user.Password+"' -AsPlainText -Force) -AccountNeverExpires -PasswordNeverExpires -UserMayNotChangePassword",
	)
	if err != nil {
		return err
	}
	if !okIfExists && userExisted {
		return fmt.Errorf("user %s already existed - cannot create", user.Name)
	}
	log.Print("Created new OS user!")
	err = host.RunBatch(
		userExisted,
		[]string{"powershell", "-Command", "Add-LocalGroupMember -Group 'Remote Desktop Users' -Member '" + user.Name + "'"},
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
	_, err := host.RunIgnoreError(
		user.Name+" is already a member of group administrators",
		"powershell", "-Command", "Add-LocalGroupMember -Group 'administrators' -Member '"+user.Name+"'",
	)
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
	err2 := host.Run("powershell", "-Command", "Remove-LocalUser -Name '"+username+"'")
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
	out, err = host.Output("powershell", "-Command", "Get-LocalUser | Select-Object -ExpandProperty Name")
	if err != nil {
		return
	}
	for _, line := range strings.Split(out, "\n") {
		trimmedLine := strings.TrimSpace(line)
		usernames = append(usernames, trimmedLine)
	}
	return
}

func UserHomeDirectoriesParent() string {
	return win32.ProfilesDirectory()
}

func WaitForLoginCompletion(timeout time.Duration, username string) error {
	userToken, err := win32.InteractiveUserToken(timeout)
	if err != nil {
		return err
	}
	tokenUser, err := userToken.GetTokenUser()
	if err != nil {
		panic(err)
	}
	account, _, _, err := tokenUser.User.Sid.LookupAccount("")
	if err != nil {
		panic(err)
	}
	if account != username {
		return fmt.Errorf("interactive username %v does not match task user %v", account, username)
	}
	return nil
}

func SetAutoLogin(user *OSUser) error {
	// Set flag registry.WOW64_64KEY since Windows 10 ARM machines will otherwise write to:
	// HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows NT\CurrentVersion\Winlogon
	k, _, err := registry.CreateKey(registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon`, registry.WRITE|registry.WOW64_64KEY)
	if err != nil {
		return fmt.Errorf(`was not able to create registry key 'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' due to %s`, err)
	}
	defer k.Close()
	err = k.SetDWordValue("AutoAdminLogon", 1)
	if err != nil {
		return fmt.Errorf(`was not able to set registry entry 'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\AutoAdminLogon' to 1 due to %s`, err)
	}
	err = k.SetStringValue("DefaultUserName", user.Name)
	if err != nil {
		return fmt.Errorf(`was not able to set registry entry 'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\DefaultUserName' to %q due to %s`, user.Name, err)
	}
	err = k.SetStringValue("DefaultPassword", user.Password)
	if err != nil {
		return fmt.Errorf(`was not able to set registry entry 'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\DefaultPassword' to %q due to %s`, user.Password, err)
	}
	return nil
}
