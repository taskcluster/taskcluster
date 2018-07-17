package win32

// Refer to
// https://msdn.microsoft.com/en-us/library/windows/desktop/aa383751(v=vs.85).aspx
// for understanding the c++ -> go type mappings

import (
	"errors"
	"fmt"
	"log"
	"os"
	"runtime"
	"sort"
	"strings"
	"syscall"
	"time"
	"unicode/utf8"
	"unsafe"
)

var (
	advapi32 = NewLazyDLL("advapi32.dll")
	kernel32 = NewLazyDLL("kernel32.dll")
	ole32    = NewLazyDLL("ole32.dll")
	shell32  = NewLazyDLL("shell32.dll")
	userenv  = NewLazyDLL("userenv.dll")
	wtsapi32 = NewLazyDLL("wtsapi32.dll")

	procCreateEnvironmentBlock       = userenv.NewProc("CreateEnvironmentBlock")
	procDestroyEnvironmentBlock      = userenv.NewProc("DestroyEnvironmentBlock")
	procSHSetKnownFolderPath         = shell32.NewProc("SHSetKnownFolderPath")
	procSHGetKnownFolderPath         = shell32.NewProc("SHGetKnownFolderPath")
	procCoTaskMemFree                = ole32.NewProc("CoTaskMemFree")
	procWTSQueryUserToken            = wtsapi32.NewProc("WTSQueryUserToken")
	procWTSGetActiveConsoleSessionId = kernel32.NewProc("WTSGetActiveConsoleSessionId")
	procGetProfilesDirectory         = userenv.NewProc("GetProfilesDirectoryW")
	procGetUserProfileDirectory      = userenv.NewProc("GetUserProfileDirectoryW")
	procVerifyVersionInfoW           = kernel32.NewProc("VerifyVersionInfoW")
	procVerSetConditionMask          = kernel32.NewProc("VerSetConditionMask")
	procGetTokenInformation          = advapi32.NewProc("GetTokenInformation")
	procLoadUserProfileW             = userenv.NewProc("LoadUserProfileW")
	procUnloadUserProfile            = userenv.NewProc("UnloadUserProfile")
	procCloseHandle                  = kernel32.NewProc("CloseHandle")
	procLogonUserW                   = advapi32.NewProc("LogonUserW")

	FOLDERID_LocalAppData   = syscall.GUID{Data1: 0xF1B32785, Data2: 0x6FBA, Data3: 0x4FCF, Data4: [8]byte{0x9D, 0x55, 0x7B, 0x8E, 0x7F, 0x15, 0x70, 0x91}}
	FOLDERID_RoamingAppData = syscall.GUID{Data1: 0x3EB685DB, Data2: 0x65F9, Data3: 0x4CF6, Data4: [8]byte{0xA0, 0x3A, 0xE3, 0xEF, 0x65, 0x72, 0x9F, 0x3D}}
)

const (
	LOGON32_PROVIDER_DEFAULT = 0

	LOGON32_LOGON_INTERACTIVE = 2

	PI_NOUI = 1

	KF_FLAG_CREATE uint32 = 0x00008000

	CREATE_BREAKAWAY_FROM_JOB = 0x01000000
	CREATE_NEW_CONSOLE        = 0x00000010
	CREATE_NEW_PROCESS_GROUP  = 0x00000200

	VER_MAJORVERSION     = 0x0000002
	VER_MINORVERSION     = 0x0000001
	VER_SERVICEPACKMAJOR = 0x0000020
	VER_SERVICEPACKMINOR = 0x0000010
	VER_GREATER_EQUAL    = 3

	ERROR_OLD_WIN_VERSION syscall.Errno = 1150

	// See https://msdn.microsoft.com/en-us/library/windows/desktop/aa379626(v=vs.85).aspx
	TokenLinkedToken = 19
)

type TOKEN_INFORMATION_CLASS uint32

type OSVersionInfoEx struct {
	OSVersionInfoSize uint32
	MajorVersion      uint32
	MinorVersion      uint32
	BuildNumber       uint32
	PlatformId        uint32
	CSDVersion        [128]uint16
	ServicePackMajor  uint16
	ServicePackMinor  uint16
	SuiteMask         uint16
	ProductType       byte
	Reserve           byte
}

type ProfileInfo struct {
	Size        uint32
	Flags       uint32
	Username    *uint16
	ProfilePath *uint16
	DefaultPath *uint16
	ServerName  *uint16
	PolicyPath  *uint16
	Profile     syscall.Handle
}

var (
	isWindows8OrGreater *bool
)

func CloseHandle(handle syscall.Handle) (err error) {
	// syscall.CloseHandle(handle)
	r1, _, e1 := procCloseHandle.Call(
		uintptr(handle),
	)
	if r1 == 0 {
		if e1 != syscall.Errno(0) {
			err = error(e1)
		} else {
			err = syscall.EINVAL
		}
		log.Printf("Error when closing handle: %v", err)
	}
	return
}

func IsWindows8OrGreater() bool {
	// only needs to be evaluated once, so use cached value if set
	if isWindows8OrGreater != nil {
		return *isWindows8OrGreater
	}
	cm := VerSetConditionMask(0, VER_MAJORVERSION, VER_GREATER_EQUAL)
	cm = VerSetConditionMask(cm, VER_MINORVERSION, VER_GREATER_EQUAL)
	cm = VerSetConditionMask(cm, VER_SERVICEPACKMAJOR, VER_GREATER_EQUAL)
	cm = VerSetConditionMask(cm, VER_SERVICEPACKMINOR, VER_GREATER_EQUAL)
	r, _ := VerifyWindowsInfoW(OSVersionInfoEx{
		MajorVersion: 6,
		MinorVersion: 2,
	}, VER_MAJORVERSION|VER_MINORVERSION|VER_SERVICEPACKMAJOR|VER_SERVICEPACKMINOR, cm)
	isWindows8OrGreater = &r
	return r
}

func LogonUser(username *uint16, domain *uint16, password *uint16, logonType uint32, logonProvider uint32) (token syscall.Handle, err error) {
	r1, _, e1 := procLogonUserW.Call(
		uintptr(unsafe.Pointer(username)),
		uintptr(unsafe.Pointer(domain)),
		uintptr(unsafe.Pointer(password)),
		uintptr(logonType),
		uintptr(logonProvider),
		uintptr(unsafe.Pointer(&token)))
	runtime.KeepAlive(username)
	runtime.KeepAlive(domain)
	runtime.KeepAlive(password)
	if int(r1) == 0 {
		return syscall.InvalidHandle, os.NewSyscallError("LogonUser", e1)
	}
	return
}

func LoadUserProfile(token syscall.Handle, pinfo *ProfileInfo) error {
	r1, _, e1 := procLoadUserProfileW.Call(
		uintptr(token),
		uintptr(unsafe.Pointer(pinfo)))
	runtime.KeepAlive(pinfo)
	if int(r1) == 0 {
		return os.NewSyscallError("LoadUserProfile", e1)
	}
	return nil
}

func UnloadUserProfile(token, profile syscall.Handle) error {
	if r1, _, e1 := procUnloadUserProfile.Call(
		uintptr(token),
		uintptr(profile)); int(r1) == 0 {
		return os.NewSyscallError("UnloadUserProfile", e1)
	}
	return nil
}

// https://msdn.microsoft.com/en-us/library/windows/desktop/bb762270(v=vs.85).aspx
func CreateEnvironmentBlock(
	lpEnvironment *uintptr, // LPVOID*
	hToken syscall.Handle, // HANDLE
	bInherit bool, // BOOL
) (err error) {
	inherit := uint32(0)
	if bInherit {
		inherit = 1
	}
	r1, _, e1 := procCreateEnvironmentBlock.Call(
		uintptr(unsafe.Pointer(lpEnvironment)),
		uintptr(hToken),
		uintptr(inherit),
	)
	if r1 == 0 {
		err = os.NewSyscallError("CreateEnvironmentBlock", e1)
	}
	return
}

// https://msdn.microsoft.com/en-us/library/windows/desktop/bb762274(v=vs.85).aspx
func DestroyEnvironmentBlock(
	lpEnvironment uintptr, // LPVOID - beware - unlike LPVOID* in CreateEnvironmentBlock!
) (err error) {
	r1, _, e1 := procDestroyEnvironmentBlock.Call(
		lpEnvironment,
	)
	if r1 == 0 {
		err = os.NewSyscallError("DestroyEnvironmentBlock", e1)
	}
	return
}

// CreateEnvironment returns an environment block, suitable for use with the
// CreateProcessAsUser system call. The default environment variables of hUser
// are overlayed with values in env.
func CreateEnvironment(env *[]string, hUser syscall.Handle) (mergedEnv *[]string, err error) {
	var logonEnv uintptr
	err = CreateEnvironmentBlock(&logonEnv, hUser, false)
	if err != nil {
		return
	}
	defer DestroyEnvironmentBlock(logonEnv)
	var varStartOffset uint
	envList := &[]string{}
	for {
		envVar := syscall.UTF16ToString((*[1 << 15]uint16)(unsafe.Pointer(logonEnv + uintptr(varStartOffset)))[:])
		if envVar == "" {
			break
		}
		*envList = append(*envList, envVar)
		// in UTF16, each rune takes two bytes, as does the trailing uint16(0)
		varStartOffset += uint(2 * (utf8.RuneCountInString(envVar) + 1))
	}
	mergedEnv, err = MergeEnvLists(envList, env)
	return
}

type envSetting struct {
	name  string
	value string
}

func MergeEnvLists(envLists ...*[]string) (*[]string, error) {
	mergedEnvMap := map[string]envSetting{}
	for _, envList := range envLists {
		if envList == nil {
			continue
		}
		for _, env := range *envList {
			if utf8.RuneCountInString(env) > 32767 {
				return nil, fmt.Errorf("Env setting is more than 32767 runes: %v", env)
			}
			spl := strings.SplitN(env, "=", 2)
			if len(spl) != 2 {
				return nil, fmt.Errorf("Could not interpret string %q as `key=value`", env)
			}
			newVarName := spl[0]
			newVarValue := spl[1]
			// if env var already exists, use case of existing name, to simulate behaviour of
			// setting an existing env var with a different case
			// e.g.
			//  set aVar=3
			//  set AVAR=4
			// results in
			//  aVar=4
			canonicalVarName := strings.ToLower(newVarName)
			if existingVarName := mergedEnvMap[canonicalVarName].name; existingVarName != "" {
				newVarName = existingVarName
			}
			mergedEnvMap[canonicalVarName] = envSetting{
				name:  newVarName,
				value: newVarValue,
			}
		}
	}
	canonicalVarNames := make([]string, len(mergedEnvMap))
	i := 0
	for k := range mergedEnvMap {
		canonicalVarNames[i] = k
		i++
	}
	// All strings in the environment block must be sorted alphabetically by
	// name. The sort is case-insensitive, Unicode order, without regard to
	// locale.
	//
	// See https://msdn.microsoft.com/en-us/library/windows/desktop/ms682009(v=vs.85).aspx
	sort.Strings(canonicalVarNames)
	// Finally piece back together into an environment block
	mergedEnv := make([]string, len(mergedEnvMap))
	i = 0
	for _, canonicalVarName := range canonicalVarNames {
		mergedEnv[i] = mergedEnvMap[canonicalVarName].name + "=" + mergedEnvMap[canonicalVarName].value
		i++
	}
	return &mergedEnv, nil
}

// https://msdn.microsoft.com/en-us/library/windows/desktop/bb762188(v=vs.85).aspx
func SHGetKnownFolderPath(rfid *syscall.GUID, dwFlags uint32, hToken syscall.Handle, pszPath *uintptr) (err error) {
	r0, _, _ := procSHGetKnownFolderPath.Call(
		uintptr(unsafe.Pointer(rfid)),
		uintptr(dwFlags),
		uintptr(hToken),
		uintptr(unsafe.Pointer(pszPath)),
	)
	if r0 != 0 {
		err = syscall.Errno(r0)
	}
	return
}

// https://msdn.microsoft.com/en-us/library/windows/desktop/bb762249(v=vs.85).aspx
func SHSetKnownFolderPath(
	rfid *syscall.GUID, // REFKNOWNFOLDERID
	dwFlags uint32, // DWORD
	hToken syscall.Handle, // HANDLE
	pszPath *uint16, // PCWSTR
) (err error) {
	r1, _, _ := procSHSetKnownFolderPath.Call(
		uintptr(unsafe.Pointer(rfid)),
		uintptr(dwFlags),
		uintptr(hToken),
		uintptr(unsafe.Pointer(pszPath)),
	)
	if r1 != 0 {
		err = syscall.Errno(r1)
	}
	return
}

// https://msdn.microsoft.com/en-us/library/windows/desktop/ms680722(v=vs.85).aspx
// Note: the system call returns no value, so we can't check for an error
func CoTaskMemFree(pv uintptr) {
	procCoTaskMemFree.Call(uintptr(pv))
}

func GetFolder(hUser syscall.Handle, folder *syscall.GUID, dwFlags uint32) (value string, err error) {
	var path uintptr
	err = SHGetKnownFolderPath(folder, dwFlags, hUser, &path)
	if err != nil {
		return
	}
	// CoTaskMemFree system call has no return value, so can't check for error
	defer CoTaskMemFree(path)
	value = syscall.UTF16ToString((*[1 << 16]uint16)(unsafe.Pointer(path))[:])
	return
}

func SetFolder(hUser syscall.Handle, folder *syscall.GUID, value string) (err error) {
	var s *uint16
	s, err = syscall.UTF16PtrFromString(value)
	if err != nil {
		return
	}
	return SHSetKnownFolderPath(folder, 0, hUser, s)
}

func SetAndCreateFolder(hUser syscall.Handle, folder *syscall.GUID, value string) (err error) {
	err = SetFolder(hUser, folder, value)
	if err != nil {
		return
	}
	_, err = GetFolder(hUser, folder, KF_FLAG_CREATE)
	return
}

// https://msdn.microsoft.com/en-us/library/aa383840(VS.85).aspx
// BOOL WTSQueryUserToken(
//    _In_  ULONG   SessionId,
//    _Out_ PHANDLE phToken
// );
func WTSQueryUserToken(
	sessionId uint32,
	phToken *syscall.Handle,
) (err error) {
	r1, _, e1 := procWTSQueryUserToken.Call(
		uintptr(sessionId),
		uintptr(unsafe.Pointer(phToken)),
	)
	if r1 == 0 {
		err = os.NewSyscallError("WTSQueryUserToken", e1)
	}
	return
}

// https://msdn.microsoft.com/en-us/library/aa383835(VS.85).aspx
// DWORD WTSGetActiveConsoleSessionId(void);
func WTSGetActiveConsoleSessionId() (sessionId uint32, err error) {
	r1, _, _ := procWTSGetActiveConsoleSessionId.Call()
	if r1 == 0xFFFFFFFF {
		err = os.NewSyscallError("WTSGetActiveConsoleSessionId", errors.New("Got return value 0xFFFFFFFF from syscall WTSGetActiveConsoleSessionId"))
	} else {
		sessionId = uint32(r1)
	}
	return
}

// InteractiveUserToken returns a user token (security context) for the
// interactive desktop session attached to the default console (i.e. what would
// be seen on a display connected directly to the computer, rather than a
// remote RDP session). It must be called from a process which is running under
// LocalSystem account in order to have the necessary privileges (typically a
// Windows service). Since the service might be running before a local logon
// occurs, a timeout can be specified for waiting for a successful logon (via
// winlogon) to occur.  The returned token can be used in e.g.
// CreateProcessAsUser system call, which allows e.g. a Windows service to run
// a process in the interactive desktop session, as if the logged in user had
// executed the process directly. The function additionally waits for the user
// profile directory to exist, before returning.
func InteractiveUserToken(timeout time.Duration) (hToken syscall.Handle, err error) {
	deadline := time.Now().Add(timeout)
	var sessionId uint32
	sessionId, err = WTSGetActiveConsoleSessionId()
	if err == nil {
		err = WTSQueryUserToken(sessionId, &hToken)
	}
	for err != nil {
		if time.Now().After(deadline) {
			return
		}
		time.Sleep(time.Second / 10)
		sessionId, err = WTSGetActiveConsoleSessionId()
		if err == nil {
			err = WTSQueryUserToken(sessionId, &hToken)
		}
	}
	// to be safe, let's make sure profile directory has already been created,
	// to avoid likely race conditions outside of this function
	var userProfileDir string
	userProfileDir, err = ProfileDirectory(hToken)
	if err == nil {
		_, err = os.Stat(userProfileDir)
	}
	for err != nil {
		if time.Now().After(deadline) {
			return
		}
		time.Sleep(time.Second / 10)
		userProfileDir, err = ProfileDirectory(hToken)
		if err == nil {
			_, err = os.Stat(userProfileDir)
		}
	}
	return
}

// https://msdn.microsoft.com/en-us/library/windows/desktop/bb762278(v=vs.85).aspx
// BOOL WINAPI GetProfilesDirectory(
//   _Out_   LPTSTR  lpProfilesDir,
//   _Inout_ LPDWORD lpcchSize
// );
func GetProfilesDirectory(
	lpProfilesDir *uint16,
	lpcchSize *uint32,
) (err error) {
	r1, _, e1 := procGetProfilesDirectory.Call(
		uintptr(unsafe.Pointer(lpProfilesDir)),
		uintptr(unsafe.Pointer(lpcchSize)),
	)
	if r1 == 0 {
		err = os.NewSyscallError("GetProfilesDirectory", e1)
	}
	return
}

// ProfileDirectory returns the profile directory of the user represented by
// the given user handle
func ProfileDirectory(hToken syscall.Handle) (string, error) {
	lpcchSize := uint32(0)
	GetUserProfileDirectory(hToken, nil, &lpcchSize)
	u16 := make([]uint16, lpcchSize)
	err := GetUserProfileDirectory(hToken, &u16[0], &lpcchSize)
	// bad token?
	if err != nil {
		return "", err
	}
	return syscall.UTF16ToString(u16), nil
}

// ProfilesDirectory returns the folder where user profiles get created,
// typically `C:\Users`
func ProfilesDirectory() string {
	lpcchSize := uint32(0)
	GetProfilesDirectory(nil, &lpcchSize)
	u16 := make([]uint16, lpcchSize)
	err := GetProfilesDirectory(&u16[0], &lpcchSize)
	if err != nil {
		// this should never happen - it means Windows is corrupt!
		panic(err)
	}
	return syscall.UTF16ToString(u16)
}

// https://msdn.microsoft.com/en-us/library/windows/desktop/bb762280(v=vs.85).aspx
// BOOL WINAPI GetUserProfileDirectory(
//   _In_      HANDLE  hToken,
//   _Out_opt_ LPTSTR  lpProfileDir,
//   _Inout_   LPDWORD lpcchSize
// );
func GetUserProfileDirectory(
	hToken syscall.Handle,
	lpProfileDir *uint16,
	lpcchSize *uint32,
) (err error) {
	r1, _, e1 := procGetUserProfileDirectory.Call(
		uintptr(hToken),
		uintptr(unsafe.Pointer(lpProfileDir)),
		uintptr(unsafe.Pointer(lpcchSize)),
	)
	if r1 == 0 {
		err = os.NewSyscallError("GetUserProfileDirectory", e1)
	}
	return
}

// https://msdn.microsoft.com/en-us/library/windows/desktop/aa446671(v=vs.85).aspx
// BOOL WINAPI GetTokenInformation(
//   _In_      HANDLE                  TokenHandle,
//   _In_      TOKEN_INFORMATION_CLASS TokenInformationClass,
//   _Out_opt_ LPVOID                  TokenInformation,
//   _In_      DWORD                   TokenInformationLength,
//   _Out_     PDWORD                  ReturnLength
// );
func GetTokenInformation(
	tokenHandle syscall.Token,
	tokenInformationClass TOKEN_INFORMATION_CLASS,
	tokenInformation uintptr,
	tokenInformationLength uintptr,
	returnLength *uintptr,
) (err error) {
	r1, _, e1 := procGetTokenInformation.Call(
		uintptr(tokenHandle),
		uintptr(tokenInformationClass),
		tokenInformation,
		tokenInformationLength,
		uintptr(unsafe.Pointer(returnLength)),
	)
	if r1 == 0 {
		err = os.NewSyscallError("GetTokenInformation", e1)
	}
	return
}

func GetLinkedToken(hToken syscall.Token) (syscall.Token, error) {
	linkedToken := TOKEN_LINKED_TOKEN{}
	tokenInformationLength := unsafe.Sizeof(linkedToken)
	returnLength := uintptr(0)
	err := GetTokenInformation(hToken, TokenLinkedToken, uintptr(unsafe.Pointer(&linkedToken)), tokenInformationLength, &returnLength)
	if returnLength != tokenInformationLength {
		return 0, fmt.Errorf("Was expecting %v bytes of data from GetTokenInformation, but got %v bytes", returnLength, tokenInformationLength)
	}
	if err != nil {
		return 0, err
	}
	return linkedToken.LinkedToken, nil
}

// https://msdn.microsoft.com/en-us/library/windows/desktop/bb530719(v=vs.85).aspx
// typedef struct _TOKEN_LINKED_TOKEN {
//   HANDLE LinkedToken;
// } TOKEN_LINKED_TOKEN, *PTOKEN_LINKED_TOKEN;
type TOKEN_LINKED_TOKEN struct {
	LinkedToken syscall.Token // HANDLE
}
