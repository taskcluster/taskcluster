package runtime

import (
	"fmt"
	"log"
	"os"
	"os/user"
	"strings"
	"syscall"
	"time"

	"github.com/taskcluster/taskcluster/v95/workers/generic-worker/host"
	"github.com/taskcluster/taskcluster/v95/workers/generic-worker/win32"
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

// CreateUserProfile creates a Windows user profile using the CreateProfile API.
// This should be called before attempting to load the user profile with LoadUserProfile
// to prevent Windows from creating a temporary profile.
// See: https://learn.microsoft.com/en-us/windows/win32/api/userenv/nf-userenv-createprofile
func (osUser *OSUser) CreateUserProfile() error {
	// Lookup user to get SID
	u, err := user.Lookup(osUser.Name)
	if err != nil {
		return fmt.Errorf("failed to lookup user %s: %w", osUser.Name, err)
	}

	log.Printf("Creating profile for user %s (SID: %s)", osUser.Name, u.Uid)

	sidPtr, err := syscall.UTF16PtrFromString(u.Uid)
	if err != nil {
		return fmt.Errorf("failed to convert SID to UTF16: %w", err)
	}

	namePtr, err := syscall.UTF16PtrFromString(osUser.Name)
	if err != nil {
		return fmt.Errorf("failed to convert username to UTF16: %w", err)
	}

	// Allocate buffer for profile path (MAX_PATH = 260)
	profilePath := make([]uint16, 260)

	err = win32.CreateProfile(sidPtr, namePtr, &profilePath[0], uint32(len(profilePath)))
	if err != nil {
		return fmt.Errorf("CreateProfile failed for user %s: %w", osUser.Name, err)
	}

	createdPath := syscall.UTF16ToString(profilePath)
	log.Printf("Created user profile at: %s", createdPath)

	// Verify the profile directory is accessible before returning
	// CreateProfile may return before the file system has fully initialized the directory
	// This prevents ERROR_NOT_READY errors when LoadUserProfile is called immediately after
	const maxRetries = 25
	const initialDelay = 50 * time.Millisecond
	const maxDelay = 5 * time.Second
	const backoffMultiplier = 1.5

	delay := initialDelay
	for i := range maxRetries {
		_, err := os.Stat(createdPath)
		if err == nil {
			return nil
		}

		if i < maxRetries-1 {
			log.Printf("Profile directory not yet accessible (attempt %d/%d), retrying in %v: %v", i+1, maxRetries, delay, err)
			time.Sleep(delay)
			delay = min(time.Duration(float64(delay)*backoffMultiplier), maxDelay)
		}
	}

	return fmt.Errorf("profile directory not accessible after %d attempts: %s", maxRetries, createdPath)
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
