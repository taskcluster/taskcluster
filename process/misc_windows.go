package process

import (
	"fmt"
	"log"
	"syscall"
	"unsafe"

	"github.com/taskcluster/generic-worker/win32"
)

// Loads user profile, using handle and username.
func loadProfile(user syscall.Handle, username string) (syscall.Handle, error) {
	var pinfo win32.ProfileInfo
	var err error
	pinfo.Size = uint32(unsafe.Sizeof(pinfo))
	pinfo.Flags = win32.PI_NOUI
	pinfo.Username, err = syscall.UTF16PtrFromString(username)
	if err != nil {
		return syscall.InvalidHandle, fmt.Errorf("UTF16PtrFromString(%q): %v", username, err)
	}

	err = win32.LoadUserProfile(user, &pinfo)
	if err != nil {
		return syscall.InvalidHandle, fmt.Errorf("LoadUserProfile(%q, %+v): %v", user, &pinfo, err)
	}
	return pinfo.Profile, nil
}

// Log user out, unloading profiles if necessary.
func (s *LoginInfo) Logout() error {
	if s.HProfile != syscall.Handle(0) && s.HProfile != syscall.InvalidHandle {
		for {
			err := win32.UnloadUserProfile(s.HUser, s.HProfile)
			if err == nil {
				break
			}
			log.Print(err)
		}
		s.HProfile = syscall.InvalidHandle
	}

	if s.HUser != syscall.Handle(0) && s.HUser != syscall.InvalidHandle {
		err := win32.CloseHandle(s.HUser)
		if err != nil {
			return err
		}
		s.HUser = syscall.InvalidHandle
	}
	return nil
}

// Login and load user profile
func (s *LoginInfo) Prepare() error {
	if s.Username == "" {
		return nil
	}

	var err error
	s.HUser, err = win32.LogonUser(
		syscall.StringToUTF16Ptr(s.Username),
		syscall.StringToUTF16Ptr("."),
		syscall.StringToUTF16Ptr(s.Password),
		win32.LOGON32_LOGON_INTERACTIVE,
		win32.LOGON32_PROVIDER_DEFAULT)

	if err != nil {
		return err
	}

	s.HProfile, err = loadProfile(s.HUser, s.Username)

	if err != nil {
		win32.CloseHandle(s.HUser)
		s.HUser = syscall.InvalidHandle
		return err
	}

	return nil
}
