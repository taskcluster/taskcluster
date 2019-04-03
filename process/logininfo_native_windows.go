// +build nativeEngine

package process

import (
	"fmt"
	"log"
	"syscall"
	"time"
	"unsafe"

	"github.com/taskcluster/generic-worker/win32"
)

// LoginInfo represents a logged in user session
type LoginInfo struct {
	username string
	password string
	// User primary access token
	hUser syscall.Token
	// User profile (user registry hive)
	hProfile syscall.Handle
	// true if a logout should be (internally) performed when the LoginInfo is released
	logoutWhenDone bool
}

func InteractiveLoginInfo(timeout time.Duration) (*LoginInfo, error) {
	hToken, err := win32.InteractiveUserToken(timeout)
	if err != nil {
		return nil, err
	}
	return &LoginInfo{
		hUser:          hToken,
		logoutWhenDone: false,
	}, nil
}

func (loginInfo *LoginInfo) AccessToken() syscall.Token {
	return loginInfo.hUser
}

func (loginInfo *LoginInfo) ElevatedAccessToken() (syscall.Token, error) {
	return win32.GetLinkedToken(loginInfo.hUser)
}

// Release resources associated to login (unmount registry give, log out user if explicitly logged in)
func (loginInfo *LoginInfo) Release() (err error) {
	if loginInfo.logoutWhenDone {
		err = loginInfo.logout()
	}
	return
}

// Loads user profile, using handle and username.
func loadProfile(user syscall.Token, username string) (syscall.Handle, error) {
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
func (s *LoginInfo) logout() error {
	if s.hProfile != syscall.Handle(0) && s.hProfile != syscall.InvalidHandle {
		for {
			err := win32.UnloadUserProfile(s.hUser, s.hProfile)
			if err == nil {
				break
			}
			log.Print(err)
		}
		s.hProfile = syscall.InvalidHandle
	}

	if s.hUser != syscall.Token(0) && s.hUser != syscall.Token(syscall.InvalidHandle) {
		err := win32.CloseHandle(syscall.Handle(s.hUser))
		if err != nil {
			return err
		}
		s.hUser = syscall.Token(syscall.InvalidHandle)
	}
	return nil
}

// Login and load user profile
func (s *LoginInfo) prepare() error {
	if s.username == "" {
		return nil
	}

	var err error
	s.hUser, err = win32.LogonUser(
		syscall.StringToUTF16Ptr(s.username),
		syscall.StringToUTF16Ptr("."),
		syscall.StringToUTF16Ptr(s.password),
		win32.LOGON32_LOGON_INTERACTIVE,
		win32.LOGON32_PROVIDER_DEFAULT)

	if err != nil {
		return err
	}

	s.logoutWhenDone = true // since we called LogonUser, we should log out when done

	s.hProfile, err = loadProfile(s.hUser, s.username)

	if err != nil {
		win32.CloseHandle(syscall.Handle(s.hUser))
		s.hUser = syscall.Token(syscall.InvalidHandle)
		return err
	}

	return nil
}

// It is the responsibility for the caller to call loginInfo.Logout() when finished with loginInfo
func NewLoginInfo(username, password string) (loginInfo *LoginInfo, err error) {
	loginInfo = &LoginInfo{username: username, password: password}
	err = loginInfo.prepare()
	if err != nil {
		return nil, err
	}
	return
}

func (loginInfo *LoginInfo) SetActiveConsoleSessionId() (err error) {
	var sessionId uint32
	sessionId, err = win32.WTSGetActiveConsoleSessionId()
	if err != nil {
		return
	}
	log.Printf("Setting active console session ID to %#x", sessionId)
	err = win32.SetTokenInformation(
		loginInfo.hUser,
		win32.TokenSessionId,
		uintptr(unsafe.Pointer(&sessionId)),
		unsafe.Sizeof(sessionId),
	)
	return
}
