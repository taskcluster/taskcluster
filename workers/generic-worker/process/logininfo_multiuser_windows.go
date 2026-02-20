//go:build multiuser

package process

import (
	"errors"
	"fmt"
	"log"
	"syscall"
	"time"
	"unsafe"

	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/win32"
)

// LoginInfo represents a logged in user session
type LoginInfo struct {
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

// Release resources associated to login (unmount registry hive, log out user if explicitly logged in)
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

	// Retry LoadUserProfile in case the device is not ready yet
	// This prevents ERROR_NOT_READY errors when the underlying storage isn't fully initialized
	const maxRetries = 25
	const initialDelay = 50 * time.Millisecond
	const maxDelay = 5 * time.Second
	const backoffMultiplier = 1.5

	delay := initialDelay
	for i := range maxRetries {
		err = win32.LoadUserProfile(user, &pinfo)
		if err == nil {
			return pinfo.Profile, nil
		}

		var errno syscall.Errno
		if errors.As(err, &errno) && errno == 21 { // ERROR_NOT_READY
			if i < maxRetries-1 {
				log.Printf("LoadUserProfile failed with 'device not ready' (attempt %d/%d), retrying in %v: %v", i+1, maxRetries, delay, err)
				time.Sleep(delay)
				delay = min(time.Duration(float64(delay)*backoffMultiplier), maxDelay)
			} else {
				return syscall.InvalidHandle, fmt.Errorf("LoadUserProfile(%#x, %+v): %v (after %d retries)", user, &pinfo, err, maxRetries)
			}
		} else {
			return syscall.InvalidHandle, fmt.Errorf("LoadUserProfile(%#x, %+v): %v", user, &pinfo, err)
		}
	}

	return syscall.InvalidHandle, fmt.Errorf("LoadUserProfile(%#x, %+v): unexpected error after retries", user, &pinfo)
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
func (s *LoginInfo) prepare(username, password string) error {

	var err error
	u, _ := syscall.UTF16PtrFromString(username)
	dot, _ := syscall.UTF16PtrFromString(".")
	p, _ := syscall.UTF16PtrFromString(password)
	s.hUser, err = win32.LogonUser(
		u,
		dot,
		p,
		win32.LOGON32_LOGON_INTERACTIVE,
		win32.LOGON32_PROVIDER_DEFAULT,
	)

	if err != nil {
		return err
	}

	s.logoutWhenDone = true // since we called LogonUser, we should log out when done

	s.hProfile, err = loadProfile(s.hUser, username)

	if err != nil {
		// ignore any error when closing since we already have one to return
		_ = win32.CloseHandle(syscall.Handle(s.hUser))
		s.hUser = syscall.Token(syscall.InvalidHandle)
		return err
	}

	return nil
}

// It is the responsibility for the caller to call loginInfo.Logout() when finished with loginInfo
func NewLoginInfo(username, password string) (loginInfo *LoginInfo, err error) {
	loginInfo = &LoginInfo{}
	err = loginInfo.prepare(username, password)
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
		(*byte)(unsafe.Pointer(&sessionId)),
		uint32(unsafe.Sizeof(sessionId)),
	)
	return
}
