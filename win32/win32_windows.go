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
	user32   = NewLazyDLL("user32.dll")

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
	runtime.KeepAlive(username)
	runtime.KeepAlive(domain)
	runtime.KeepAlive(password)
	if int(r1) == 0 {
		return syscall.Token(syscall.InvalidHandle), os.NewSyscallError("LogonUser", e1)
	}
	return
}

func LoadUserProfile(token syscall.Token, pinfo *ProfileInfo) error {
	r1, _, e1 := procLoadUserProfileW.Call(
		uintptr(token),
		uintptr(unsafe.Pointer(pinfo)))
	runtime.KeepAlive(pinfo)
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
	lpEnvironment *uintptr, // LPVOID*
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
func CreateEnvironment(env *[]string, hUser syscall.Token) (mergedEnv *[]string, err error) {
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

// https://msdn.microsoft.com/en-us/library/windows/desktop/bb762188(v=vs.85).aspx
func SHGetKnownFolderPath(rfid *syscall.GUID, dwFlags uint32, hToken syscall.Token, pszPath *uintptr) (err error) {
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
func CoTaskMemFree(pv uintptr) {
	procCoTaskMemFree.Call(uintptr(pv))
}

func GetFolder(hUser syscall.Token, folder *syscall.GUID, dwFlags uint32) (value string, err error) {
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

func SetFolder(hUser syscall.Token, folder *syscall.GUID, value string) (err error) {
	var s *uint16
	s, err = syscall.UTF16PtrFromString(value)
	if err != nil {
		return
	}
	return SHSetKnownFolderPath(folder, 0, hUser, s)
}

func SetAndCreateFolder(hUser syscall.Token, folder *syscall.GUID, value string) (err error) {
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
		err = os.NewSyscallError("WTSGetActiveConsoleSessionId", errors.New("There is no session attached to the physical console (return code 0xFFFFFFFF in WTSGetActiveConsoleSessionId)"))
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
func ProfileDirectory(hToken syscall.Token) (string, error) {
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
	runtime.KeepAlive(tokenInformation)
	runtime.KeepAlive(tokenInformationLength)
	if r1 == 0 {
		err = os.NewSyscallError("GetTokenInformation", e1)
	}
	return
}

// https://msdn.microsoft.com/en-us/library/windows/desktop/aa379591(v=vs.85).aspx
// BOOL WINAPI SetTokenInformation(
//   _In_ HANDLE                  TokenHandle,
//   _In_ TOKEN_INFORMATION_CLASS TokenInformationClass,
//   _In_ LPVOID                  TokenInformation,
//   _In_ DWORD                   TokenInformationLength
// );
func SetTokenInformation(
	tokenHandle syscall.Token,
	tokenInformationClass TOKEN_INFORMATION_CLASS,
	tokenInformation uintptr,
	tokenInformationLength uintptr,
) (err error) {
	r1, _, e1 := procSetTokenInformation.Call(
		uintptr(tokenHandle),
		uintptr(tokenInformationClass),
		tokenInformation,
		tokenInformationLength,
	)
	runtime.KeepAlive(tokenInformation)
	runtime.KeepAlive(tokenInformationLength)
	if r1 == 0 {
		err = os.NewSyscallError("SetTokenInformation", e1)
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

func GetTokenSessionID(hToken syscall.Token) (uint32, error) {
	var tokenSessionID uint32
	tokenInformationLength := unsafe.Sizeof(tokenSessionID)
	returnLength := uintptr(0)
	err := GetTokenInformation(hToken, TokenSessionId, uintptr(unsafe.Pointer(&tokenSessionID)), tokenInformationLength, &returnLength)
	if returnLength != tokenInformationLength {
		return 0, fmt.Errorf("Was expecting %v bytes of data from GetTokenInformation, but got %v bytes", returnLength, tokenInformationLength)
	}
	if err != nil {
		return 0, err
	}
	return tokenSessionID, nil
}

func GetTokenUIAccess(hToken syscall.Token) (uint32, error) {
	var tokenUIAccess uint32
	tokenInformationLength := unsafe.Sizeof(tokenUIAccess)
	returnLength := uintptr(0)
	err := GetTokenInformation(hToken, TokenUIAccess, uintptr(unsafe.Pointer(&tokenUIAccess)), tokenInformationLength, &returnLength)
	if returnLength != tokenInformationLength {
		return 0, fmt.Errorf("Was expecting %v bytes of data from GetTokenInformation, but got %v bytes", returnLength, tokenInformationLength)
	}
	if err != nil {
		return 0, err
	}
	return tokenUIAccess, nil
}

// https://msdn.microsoft.com/en-us/library/windows/desktop/bb530719(v=vs.85).aspx
// typedef struct _TOKEN_LINKED_TOKEN {
//   HANDLE LinkedToken;
// } TOKEN_LINKED_TOKEN, *PTOKEN_LINKED_TOKEN;
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
//   _In_ HANDLE hToken
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
	runtime.KeepAlive(&nLength)
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
