package win32

// Refer to
// https://msdn.microsoft.com/en-us/library/windows/desktop/aa383751(v=vs.85).aspx
// for understanding the c++ -> go type mappings

import (
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"syscall"
	"time"
	"unicode/utf16"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	advapi32 = NewLazyDLL("advapi32.dll")
	kernel32 = NewLazyDLL("kernel32.dll")
	ole32    = NewLazyDLL("ole32.dll")
	shell32  = NewLazyDLL("shell32.dll")
	userenv  = NewLazyDLL("userenv.dll")
	wtsapi32 = NewLazyDLL("wtsapi32.dll")
	user32   = NewLazyDLL("user32.dll")

	procCreateEnvironmentBlock       = userenv.NewProc("CreateEnvironmentBlock")
	procDestroyEnvironmentBlock      = userenv.NewProc("DestroyEnvironmentBlock")
	procSHSetKnownFolderPath         = shell32.NewProc("SHSetKnownFolderPath")
	procSHGetKnownFolderPath         = shell32.NewProc("SHGetKnownFolderPath")
	procCoTaskMemFree                = ole32.NewProc("CoTaskMemFree")
	procWTSQueryUserToken            = wtsapi32.NewProc("WTSQueryUserToken")
	procWTSGetActiveConsoleSessionId = kernel32.NewProc("WTSGetActiveConsoleSessionId")
	procGetProfilesDirectoryW        = userenv.NewProc("GetProfilesDirectoryW")
	procGetUserProfileDirectory      = userenv.NewProc("GetUserProfileDirectoryW")
	procVerifyVersionInfoW           = kernel32.NewProc("VerifyVersionInfoW")
	procVerSetConditionMask          = kernel32.NewProc("VerSetConditionMask")
	procGetTokenInformation          = advapi32.NewProc("GetTokenInformation")
	procSetTokenInformation          = advapi32.NewProc("SetTokenInformation")
	procLoadUserProfileW             = userenv.NewProc("LoadUserProfileW")
	procUnloadUserProfile            = userenv.NewProc("UnloadUserProfile")
	procCloseHandle                  = kernel32.NewProc("CloseHandle")
	procLogonUserW                   = advapi32.NewProc("LogonUserW")
	procImpersonateLoggedOnUser      = advapi32.NewProc("ImpersonateLoggedOnUser")
	procRevertToSelf                 = advapi32.NewProc("RevertToSelf")
	procGetProcessWindowStation      = user32.NewProc("GetProcessWindowStation")
	procGetCurrentThreadId           = kernel32.NewProc("GetCurrentThreadId")
	procGetThreadDesktop             = user32.NewProc("GetThreadDesktop")
	procGetUserObjectInformationW    = user32.NewProc("GetUserObjectInformationW")
	procDeleteProfileW               = userenv.NewProc("DeleteProfileW")
	procCreateProfile                = userenv.NewProc("CreateProfile")
	procGetDiskFreeSpaceExW          = kernel32.NewProc("GetDiskFreeSpaceExW")

	FOLDERID_LocalAppData   = syscall.GUID{Data1: 0xF1B32785, Data2: 0x6FBA, Data3: 0x4FCF, Data4: [8]byte{0x9D, 0x55, 0x7B, 0x8E, 0x7F, 0x15, 0x70, 0x91}}
	FOLDERID_RoamingAppData = syscall.GUID{Data1: 0x3EB685DB, Data2: 0x65F9, Data3: 0x4CF6, Data4: [8]byte{0xA0, 0x3A, 0xE3, 0xEF, 0x65, 0x72, 0x9F, 0x3D}}
)

const (
	LOGON32_PROVIDER_DEFAULT = 0

	LOGON32_LOGON_INTERACTIVE = 2

	PI_NOUI = 1

	KF_FLAG_CREATE uint32 = 0x00008000

	// https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags
	CREATE_BREAKAWAY_FROM_JOB = 0x01000000
	CREATE_NEW_CONSOLE        = 0x00000010
	CREATE_NEW_PROCESS_GROUP  = 0x00000200

	VER_MAJORVERSION     = 0x0000002
	VER_MINORVERSION     = 0x0000001
	VER_SERVICEPACKMAJOR = 0x0000020
	VER_SERVICEPACKMINOR = 0x0000010
	VER_GREATER_EQUAL    = 3

	ERROR_OLD_WIN_VERSION syscall.Errno = 1150

	// https://msdn.microsoft.com/en-us/library/windows/hardware/ff556838(v=vs.85).aspx
	// TOKEN_INFORMATION_CLASS enumeration
	TokenUser                            TOKEN_INFORMATION_CLASS = 1
	TokenGroups                          TOKEN_INFORMATION_CLASS = 2
	TokenPrivileges                      TOKEN_INFORMATION_CLASS = 3
	TokenOwner                           TOKEN_INFORMATION_CLASS = 4
	TokenPrimaryGroup                    TOKEN_INFORMATION_CLASS = 5
	TokenDefaultDacl                     TOKEN_INFORMATION_CLASS = 6
	TokenSourceX                         TOKEN_INFORMATION_CLASS = 7
	TokenType                            TOKEN_INFORMATION_CLASS = 8
	TokenImpersonationLevel              TOKEN_INFORMATION_CLASS = 9
	TokenStatistics                      TOKEN_INFORMATION_CLASS = 10
	TokenRestrictedSids                  TOKEN_INFORMATION_CLASS = 11
	TokenSessionId                       TOKEN_INFORMATION_CLASS = 12
	TokenGroupsAndPrivileges             TOKEN_INFORMATION_CLASS = 13
	TokenSessionReference                TOKEN_INFORMATION_CLASS = 14
	TokenSandBoxInert                    TOKEN_INFORMATION_CLASS = 15
	TokenAuditPolicy                     TOKEN_INFORMATION_CLASS = 16
	TokenOrigin                          TOKEN_INFORMATION_CLASS = 17
	TokenElevationType                   TOKEN_INFORMATION_CLASS = 18
	TokenLinkedToken                     TOKEN_INFORMATION_CLASS = 19
	TokenElevation                       TOKEN_INFORMATION_CLASS = 20
	TokenHasRestrictions                 TOKEN_INFORMATION_CLASS = 21
	TokenAccessInformation               TOKEN_INFORMATION_CLASS = 22
	TokenVirtualizationAllowed           TOKEN_INFORMATION_CLASS = 23
	TokenVirtualizationEnabled           TOKEN_INFORMATION_CLASS = 24
	TokenIntegrityLevel                  TOKEN_INFORMATION_CLASS = 25
	TokenUIAccess                        TOKEN_INFORMATION_CLASS = 26
	TokenMandatoryPolicy                 TOKEN_INFORMATION_CLASS = 27
	TokenLogonSid                        TOKEN_INFORMATION_CLASS = 28
	TokenIsAppContainer                  TOKEN_INFORMATION_CLASS = 29
	TokenCapabilities                    TOKEN_INFORMATION_CLASS = 30
	TokenAppContainerSid                 TOKEN_INFORMATION_CLASS = 31
	TokenAppContainerNumber              TOKEN_INFORMATION_CLASS = 32
	TokenUserClaimAttributes             TOKEN_INFORMATION_CLASS = 33
	TokenDeviceClaimAttributes           TOKEN_INFORMATION_CLASS = 34
	TokenRestrictedUserClaimAttributes   TOKEN_INFORMATION_CLASS = 35
	TokenRestrictedDeviceClaimAttributes TOKEN_INFORMATION_CLASS = 36
	TokenDeviceGroups                    TOKEN_INFORMATION_CLASS = 37
	TokenRestrictedDeviceGroups          TOKEN_INFORMATION_CLASS = 38
	TokenSecurityAttributes              TOKEN_INFORMATION_CLASS = 39
	TokenIsRestricted                    TOKEN_INFORMATION_CLASS = 40
	TokenProcessTrustLevel               TOKEN_INFORMATION_CLASS = 41
	MaxTokenInfoClass                    TOKEN_INFORMATION_CLASS = 42
)

type TOKEN_INFORMATION_CLASS uint32

type Hwinsta uintptr
type Hdesk uintptr

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

func boolToUint32(src bool) uint32 {
	if src {
		return 1
	}
	return 0
}

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

func LogonUser(username *uint16, domain *uint16, password *uint16, logonType uint32, logonProvider uint32) (token syscall.Token, err error) {
	r1, _, e1 := procLogonUserW.Call(
		uintptr(unsafe.Pointer(username)),
		uintptr(unsafe.Pointer(domain)),
		uintptr(unsafe.Pointer(password)),
		uintptr(logonType),
		uintptr(logonProvider),
		uintptr(unsafe.Pointer(&token)))
	if int(r1) == 0 {
		return syscall.Token(syscall.InvalidHandle), os.NewSyscallError("LogonUser", e1)
	}
	return
}

func LoadUserProfile(token syscall.Token, pinfo *ProfileInfo) error {
	r1, _, e1 := procLoadUserProfileW.Call(
		uintptr(token),
		uintptr(unsafe.Pointer(pinfo)))
	if int(r1) == 0 {
		return os.NewSyscallError("LoadUserProfile", e1)
	}
	return nil
}

// https://docs.microsoft.com/en-us/windows/desktop/api/userenv/nf-userenv-unloaduserprofile
func UnloadUserProfile(token syscall.Token, profile syscall.Handle) error {
	if r1, _, e1 := procUnloadUserProfile.Call(
		uintptr(token),
		uintptr(profile)); int(r1) == 0 {
		return os.NewSyscallError("UnloadUserProfile", e1)
	}
	return nil
}

// https://msdn.microsoft.com/en-us/library/windows/desktop/bb762270(v=vs.85).aspx
func CreateEnvironmentBlock(
	lpEnvironment **uint16, // LPVOID*
	hToken syscall.Token, // HANDLE
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
	lpEnvironment *uint16, // LPVOID - beware - unlike LPVOID* in CreateEnvironmentBlock!
) (err error) {
	r1, _, e1 := procDestroyEnvironmentBlock.Call(
		uintptr(unsafe.Pointer(lpEnvironment)),
	)
	if r1 == 0 {
		err = os.NewSyscallError("DestroyEnvironmentBlock", e1)
	}
	return
}

// CreateEnvironment returns an environment block, suitable for use with the
// CreateProcessAsUser system call. The default environment variables of hUser
// are overlayed with values in env.
func CreateEnvironment(env *[]string, hUser syscall.Token) (mergedEnv *[]string, err error) {
	var logonEnv *uint16
	err = CreateEnvironmentBlock(&logonEnv, hUser, false)
	if err != nil {
		return
	}
	defer func(logonEnv *uint16) {
		err2 := DestroyEnvironmentBlock(logonEnv)
		if err == nil {
			err = err2
		}
	}(logonEnv)
	envList := &[]string{}
	u16 := (*[1 << 15]uint16)(unsafe.Pointer(logonEnv))
	start := 0
	for i, v := range u16 {
		if v == 0 {
			if i == start {
				break
			}
			*envList = append(*envList, string(utf16.Decode(u16[start:i])))
			start = i + 1
		}
	}
	mergedEnv, err = MergeEnvLists(envList, env)
	return
}

// https://msdn.microsoft.com/en-us/library/windows/desktop/bb762188(v=vs.85).aspx
func SHGetKnownFolderPath(rfid *syscall.GUID, dwFlags uint32, hToken syscall.Token, pszPath **uint16) (err error) {
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
	hToken syscall.Token, // HANDLE
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
func CoTaskMemFree(pv *uint16) {
	_, _, _ = procCoTaskMemFree.Call(uintptr(unsafe.Pointer(pv)))
}

func GetFolder(hUser syscall.Token, folder *syscall.GUID, dwFlags uint32) (value string, err error) {
	var path *uint16
	err = SHGetKnownFolderPath(folder, dwFlags, hUser, &path)
	if err != nil {
		return
	}
	// CoTaskMemFree system call has no return value, so can't check for error
	defer CoTaskMemFree(path)
	value = syscall.UTF16ToString((*[1 << 16]uint16)(unsafe.Pointer(path))[:])
	return
}

func SetFolder(hUser syscall.Token, folder *syscall.GUID, value string) (err error) {
	var s *uint16
	s, err = syscall.UTF16PtrFromString(value)
	if err != nil {
		return
	}
	return SHSetKnownFolderPath(folder, 0, hUser, s)
}

func SetAndCreateFolder(hUser syscall.Token, folder *syscall.GUID, value string) (err error) {
	log.Printf("Creating folder %v", value)
	err = SetFolder(hUser, folder, value)
	if err != nil {
		return
	}
	_, err = GetFolder(hUser, folder, KF_FLAG_CREATE)
	return
}

// https://msdn.microsoft.com/en-us/library/aa383840(VS.85).aspx
// BOOL WTSQueryUserToken(
//
//	_In_  ULONG   SessionId,
//	_Out_ PHANDLE phToken
//
// );
func WTSQueryUserToken(
	sessionId uint32,
	phToken *syscall.Token,
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
		err = os.NewSyscallError("WTSGetActiveConsoleSessionId", errors.New("there is no session attached to the physical console (return code 0xFFFFFFFF in WTSGetActiveConsoleSessionId)"))
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
func InteractiveUserToken(timeout time.Duration) (hToken syscall.Token, err error) {
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

// https://docs.microsoft.com/en-us/windows/win32/api/userenv/nf-userenv-getprofilesdirectoryw
// USERENVAPI BOOL GetProfilesDirectoryW(
//
//	LPWSTR  lpProfileDir,
//	LPDWORD lpcchSize
//
// );
func GetProfilesDirectory(dir *uint16, dirLen *uint32) (err error) {
	r1, _, e1 := procGetProfilesDirectoryW.Call(uintptr(unsafe.Pointer(dir)), uintptr(unsafe.Pointer(dirLen)))
	if r1 == 0 {
		if e1 != syscall.Errno(0) {
			err = error(e1)
		} else {
			err = syscall.EINVAL
		}
	}
	return
}

// ProfileDirectory returns the profile directory of the user represented by
// the given user handle
func ProfileDirectory(hToken syscall.Token) (string, error) {
	n := uint32(100)
	for {
		b := make([]uint16, n)
		_ = GetUserProfileDirectory(hToken, nil, &n)
		e := GetUserProfileDirectory(hToken, &b[0], &n)
		if e == nil {
			return syscall.UTF16ToString(b), nil
		}
		if e != syscall.ERROR_INSUFFICIENT_BUFFER {
			// this should never happen
			return "", e
		}
		if n <= uint32(len(b)) {
			// this should never happen
			return "", e
		}
	}
}

// ProfilesDirectory returns the folder where user profiles get created,
// typically `C:\Users`
func ProfilesDirectory() string {
	n := uint32(100)
	for {
		b := make([]uint16, n)
		e := GetProfilesDirectory(&b[0], &n)
		if e == nil {
			return syscall.UTF16ToString(b)
		}
		if e != syscall.ERROR_INSUFFICIENT_BUFFER {
			// this should never happen
			panic(e)
		}
		if n <= uint32(len(b)) {
			// this should never happen
			panic(e)
		}
	}
}

// https://msdn.microsoft.com/en-us/library/windows/desktop/bb762280(v=vs.85).aspx
// BOOL WINAPI GetUserProfileDirectory(
//
//	_In_      HANDLE  hToken,
//	_Out_opt_ LPTSTR  lpProfileDir,
//	_Inout_   LPDWORD lpcchSize
//
// );
func GetUserProfileDirectory(
	hToken syscall.Token,
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
//
//	_In_      HANDLE                  TokenHandle,
//	_In_      TOKEN_INFORMATION_CLASS TokenInformationClass,
//	_Out_opt_ LPVOID                  TokenInformation,
//	_In_      DWORD                   TokenInformationLength,
//	_Out_     PDWORD                  ReturnLength
//
// );
func GetTokenInformation(
	tokenHandle syscall.Token,
	tokenInformationClass TOKEN_INFORMATION_CLASS,
	tokenInformation *byte,
	tokenInformationLength uint32,
	returnLength *uint32,
) (err error) {
	r1, _, e1 := procGetTokenInformation.Call(
		uintptr(tokenHandle),
		uintptr(tokenInformationClass),
		uintptr(unsafe.Pointer(tokenInformation)),
		uintptr(tokenInformationLength),
		uintptr(unsafe.Pointer(returnLength)),
	)
	if r1 == 0 {
		err = os.NewSyscallError("GetTokenInformation", e1)
	}
	return
}

func GetLinkedToken(hToken syscall.Token) (syscall.Token, error) {
	var linkedToken TOKEN_LINKED_TOKEN
	tokenInformationLength := uint32(unsafe.Sizeof(linkedToken))
	returnLength := uint32(0)
	err := GetTokenInformation(hToken, TokenLinkedToken, (*byte)(unsafe.Pointer(&linkedToken)), tokenInformationLength, &returnLength)
	if returnLength != tokenInformationLength {
		return 0, fmt.Errorf("was expecting %v bytes of data from GetTokenInformation, but got %v bytes", returnLength, tokenInformationLength)
	}
	if err != nil {
		return 0, err
	}
	return linkedToken.LinkedToken, nil
}

// https://msdn.microsoft.com/en-us/library/windows/desktop/aa379591(v=vs.85).aspx
// BOOL WINAPI SetTokenInformation(
//
//	_In_ HANDLE                  TokenHandle,
//	_In_ TOKEN_INFORMATION_CLASS TokenInformationClass,
//	_In_ LPVOID                  TokenInformation,
//	_In_ DWORD                   TokenInformationLength
//
// );
func SetTokenInformation(
	tokenHandle syscall.Token,
	tokenInformationClass TOKEN_INFORMATION_CLASS,
	tokenInformation *byte,
	tokenInformationLength uint32,
) (err error) {
	r1, _, e1 := procSetTokenInformation.Call(
		uintptr(tokenHandle),
		uintptr(tokenInformationClass),
		uintptr(unsafe.Pointer(tokenInformation)),
		uintptr(tokenInformationLength),
	)
	if r1 == 0 {
		err = os.NewSyscallError("SetTokenInformation", e1)
	}
	return
}

func GetTokenSessionID(hToken syscall.Token) (uint32, error) {
	var tokenSessionID uint32
	tokenInformationLength := uint32(unsafe.Sizeof(tokenSessionID))
	returnLength := uint32(0)
	err := GetTokenInformation(hToken, TokenSessionId, (*byte)(unsafe.Pointer(&tokenSessionID)), tokenInformationLength, &returnLength)
	if returnLength != tokenInformationLength {
		return 0, fmt.Errorf("was expecting %v bytes of data from GetTokenInformation, but got %v bytes", returnLength, tokenInformationLength)
	}
	if err != nil {
		return 0, err
	}
	return tokenSessionID, nil
}

func GetTokenUIAccess(hToken syscall.Token) (uint32, error) {
	var tokenUIAccess uint32
	tokenInformationLength := uint32(unsafe.Sizeof(tokenUIAccess))
	returnLength := uint32(0)
	err := GetTokenInformation(hToken, TokenUIAccess, (*byte)(unsafe.Pointer(&tokenUIAccess)), tokenInformationLength, &returnLength)
	if returnLength != tokenInformationLength {
		return 0, fmt.Errorf("was expecting %v bytes of data from GetTokenInformation, but got %v bytes", returnLength, tokenInformationLength)
	}
	if err != nil {
		return 0, err
	}
	return tokenUIAccess, nil
}

// https://msdn.microsoft.com/en-us/library/windows/desktop/bb530719(v=vs.85).aspx
//
//	typedef struct _TOKEN_LINKED_TOKEN {
//	  HANDLE LinkedToken;
//	} TOKEN_LINKED_TOKEN, *PTOKEN_LINKED_TOKEN;
type TOKEN_LINKED_TOKEN struct {
	LinkedToken syscall.Token // HANDLE
}

// https://msdn.microsoft.com/en-us/library/windows/desktop/aa379261(v=vs.85).aspx
type LUID struct {
	LowPart  uint32 // DWORD
	HighPart int32  // LONG
}

// https://msdn.microsoft.com/en-us/library/Aa378612(v=VS.85).aspx
// BOOL WINAPI ImpersonateLoggedOnUser(
//
//	_In_ HANDLE hToken
//
// );
func ImpersonateLoggedOnUser(hToken syscall.Token) (err error) {
	r1, _, e1 := procImpersonateLoggedOnUser.Call(
		uintptr(hToken),
	)
	if r1 == 0 {
		err = os.NewSyscallError("ImpersonateLoggedOnUser", e1)
	}
	return
}

// https://msdn.microsoft.com/en-us/library/aa379317(v=vs.85).aspx
// BOOL WINAPI RevertToSelf(void);
func RevertToSelf() (err error) {
	r1, _, e1 := procRevertToSelf.Call()
	if r1 == 0 {
		err = os.NewSyscallError("RevertToSelf", e1)
	}
	return
}

func GetProcessWindowStation() (Hwinsta, error) {
	r1, _, e1 := procGetProcessWindowStation.Call()
	if int(r1) == 0 {
		return Hwinsta(r1), os.NewSyscallError("GetProcessWindowStation", e1)
	}
	return Hwinsta(r1), nil
}

func GetCurrentThreadId() uint32 {
	r1, _, _ := procGetCurrentThreadId.Call()
	return uint32(r1)
}

func GetThreadDesktop(threadId uint32) (Hdesk, error) {
	r1, _, e1 := procGetThreadDesktop.Call(
		uintptr(threadId))
	if int(r1) == 0 {
		return Hdesk(r1), os.NewSyscallError("GetThreadDesktop", e1)
	}
	return Hdesk(r1), nil
}

func GetUserObjectInformation(obj syscall.Handle, index int, info unsafe.Pointer, length uint32) (uint32, error) {
	var nLength uint32
	r1, _, e1 := procGetUserObjectInformationW.Call(
		uintptr(obj),
		uintptr(index),
		uintptr(info),
		uintptr(length),
		uintptr(unsafe.Pointer(&nLength)))
	if int(r1) == 0 {
		return nLength, os.NewSyscallError("GetUserObjectInformation", e1)
	}
	return 0, nil
}

const (
	UOI_NAME = 2
)

func GetUserObjectName(obj syscall.Handle) (string, error) {
	namebuf := make([]uint16, 256)
	_, err := GetUserObjectInformation(obj, UOI_NAME, unsafe.Pointer(&namebuf[0]), 256*2)
	if err != nil {
		return "", err
	}
	return syscall.UTF16ToString(namebuf), nil
}

func DumpTokenInfo(token syscall.Token) {
	log.Print("==================================================")
	primaryGroup, err := token.GetTokenPrimaryGroup()
	if err != nil {
		panic(err)
	}
	account, domain, accType, err := primaryGroup.PrimaryGroup.LookupAccount("")
	if err != nil {
		panic(err)
	}
	primaryGroupSid, err := primaryGroup.PrimaryGroup.String()
	if err != nil {
		panic(err)
	}
	log.Printf("Token Primary Group (%v): %v/%v (%#x)", primaryGroupSid, account, domain, accType)
	tokenUser, err := token.GetTokenUser()
	if err != nil {
		panic(err)
	}
	tokenUserSid, err := tokenUser.User.Sid.String()
	if err != nil {
		panic(err)
	}
	account, domain, accType, err = tokenUser.User.Sid.LookupAccount("")
	if err != nil {
		panic(err)
	}
	log.Printf("Token User (%v): %v/%v (%#x) - with attributes: %#x", tokenUserSid, account, domain, accType, tokenUser.User.Attributes)
	tokenSessionID, err := GetTokenSessionID(token)
	if err != nil {
		panic(err)
	}
	log.Printf("Token Session ID: %#x", tokenSessionID)
	tokenUIAccess, err := GetTokenUIAccess(token)
	if err != nil {
		panic(err)
	}
	log.Printf("Token UI Access: %#x", tokenUIAccess)
	wt := windows.Token(token)
	tokenGroups, err := wt.GetTokenGroups()
	if err != nil {
		panic(err)
	}
	groups := make([]windows.SIDAndAttributes, tokenGroups.GroupCount)
	for i := range tokenGroups.GroupCount {
		groups[i] = *(*windows.SIDAndAttributes)(unsafe.Pointer(uintptr(unsafe.Pointer(&tokenGroups.Groups[0])) + uintptr(i)*unsafe.Sizeof(tokenGroups.Groups[0])))
		groupSid := groups[i].Sid.String()
		account, domain, accType, err := groups[i].Sid.LookupAccount("")
		if err != nil {
			log.Printf("Token Group (%v): <<NO_SID>> - with attributes: %#x", groupSid, groups[i].Attributes)
		} else {
			log.Printf("Token Group (%v): %v/%v (%#x) - with attributes: %#x", groupSid, account, domain, accType, groups[i].Attributes)
		}
	}

	log.Print("==================================================")
}

// https://docs.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getdiskfreespaceexw
// BOOL GetDiskFreeSpaceExW(
//
//	LPCWSTR         lpDirectoryName,
//	PULARGE_INTEGER lpFreeBytesAvailableToCaller,
//	PULARGE_INTEGER lpTotalNumberOfBytes,
//	PULARGE_INTEGER lpTotalNumberOfFreeBytes
//
// );
func GetDiskFreeSpace(
	lpDirectoryName *uint16,
	lpFreeBytesAvailableToCaller *uint64,
	lpTotalNumberOfBytes *uint64,
	lpTotalNumberOfFreeBytes *uint64,
) (err error) {
	r1, _, e1 := procGetDiskFreeSpaceExW.Call(
		uintptr(unsafe.Pointer(lpDirectoryName)),
		uintptr(unsafe.Pointer(lpFreeBytesAvailableToCaller)),
		uintptr(unsafe.Pointer(lpTotalNumberOfBytes)),
		uintptr(unsafe.Pointer(lpTotalNumberOfFreeBytes)),
	)
	if r1 == 0 {
		err = os.NewSyscallError("GetDiskFreeSpaceExW", e1)
	}
	return
}

// https://docs.microsoft.com/en-us/windows/win32/api/userenv/nf-userenv-deleteprofilew
// USERENVAPI BOOL DeleteProfileW(
//
//	LPCWSTR lpSidString,
//	LPCWSTR lpProfilePath,
//	LPCWSTR lpComputerName
//
// );
func DeleteProfile(
	lpSidString *uint16,
	lpProfilePath *uint16,
	lpComputerName *uint16,
) (err error) {
	r1, _, e1 := procDeleteProfileW.Call(
		uintptr(unsafe.Pointer(lpSidString)),
		uintptr(unsafe.Pointer(lpProfilePath)),
		uintptr(unsafe.Pointer(lpComputerName)),
	)
	if r1 == 0 {
		err = os.NewSyscallError("DeleteProfileW", e1)
	}
	return
}

// https://learn.microsoft.com/en-us/windows/win32/api/userenv/nf-userenv-createprofile
// USERENVAPI HRESULT CreateProfile(
//
//	[in]  LPCWSTR pszUserSid,
//	[in]  LPCWSTR pszUserName,
//	[out] LPWSTR  pszProfilePath,
//	[in]  DWORD   cchProfilePath
//
// );
func CreateProfile(
	lpSidString *uint16,
	lpUserName *uint16,
	lpProfilePath *uint16,
	cchProfilePath uint32,
) (err error) {
	r1, _, e1 := procCreateProfile.Call(
		uintptr(unsafe.Pointer(lpSidString)),
		uintptr(unsafe.Pointer(lpUserName)),
		uintptr(unsafe.Pointer(lpProfilePath)),
		uintptr(cchProfilePath),
	)
	// HRESULT: S_OK = 0, failure < 0
	// HRESULT_FROM_WIN32(ERROR_ALREADY_EXISTS) = 0x800700B7
	if int32(r1) < 0 {
		// Ignore if profile already exists
		if uint32(r1) != 0x800700B7 {
			err = os.NewSyscallError("CreateProfile", e1)
		}
	}
	return
}

// ArgvToCommandLineW performs the reverse of shell32 CommandLineToArgvW:
//
//	https://docs.microsoft.com/en-us/windows/win32/api/shellapi/nf-shellapi-commandlinetoargvw?redirectedfrom=MSDN
//
// See: https://blogs.msdn.microsoft.com/twistylittlepassagesallalike/2011/04/23/everyone-quotes-command-line-arguments-the-wrong-way/
func ArgvToCommandLineW(text string) string {
	if text != "" && !strings.ContainsAny(text, " \t\n\v\"") {
		return text
	}
	escaped := `"`
	for i := range len(text) {
		backslashes := 0
		for ; i < len(text) && text[i] == '\\'; i++ {
			backslashes++
		}
		switch {
		case i == len(text)-1:
			escaped += strings.Repeat(`\`, backslashes*2)
		case text[i] == '"':
			escaped += strings.Repeat(`\`, backslashes*2) + `\"`
		default:
			escaped += strings.Repeat(`\`, backslashes)
		}
	}
	escaped += `"`
	return escaped
}

// CMDExeEscape escapes cmd.exe metacharacters
// See: https://blogs.msdn.microsoft.com/twistylittlepassagesallalike/2011/04/23/everyone-quotes-command-line-arguments-the-wrong-way/
func CMDExeEscape(text string) string {
	cmdEscaped := ""
	for _, c := range text {
		if strings.ContainsRune(`()%!^"<>&|`, c) {
			cmdEscaped += "^"
		}
		cmdEscaped += string(c)
	}
	return cmdEscaped
}

func VerSetConditionMask(lConditionMask uint64, typeBitMask uint32, conditionMask uint8) uint64 {
	r1, _, _ := procVerSetConditionMask.Call(uintptr(lConditionMask), uintptr(typeBitMask), uintptr(conditionMask))
	return uint64(r1)
}

func VerifyWindowsInfoW(vi OSVersionInfoEx, typeMask uint32, conditionMask uint64) (bool, error) {
	vi.OSVersionInfoSize = uint32(unsafe.Sizeof(vi))

	r1, _, e1 := procVerifyVersionInfoW.Call(uintptr(unsafe.Pointer(&vi)), uintptr(typeMask), uintptr(conditionMask))
	if r1 != 0 {
		return true, nil
	}
	if r1 == 0 && e1 == ERROR_OLD_WIN_VERSION {
		return false, nil
	}
	return false, os.NewSyscallError("VerifyVersionInfoW", e1)
}
