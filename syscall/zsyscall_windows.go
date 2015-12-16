// Generated with
//  go run /usr/local/Cellar/go/1.5.1/libexec/src/syscall/mksyscall_windows.go -output syscall/zsyscall_windows.go syscall/syscall_windows.go
// and then modified to improve layout, and to refer to system syscall package instead of local one, where appropriate.

package syscall

import (
	"syscall"
	"unsafe"
)

var _ unsafe.Pointer

var (
	modadvapi32 = syscall.NewLazyDLL("advapi32.dll")
	modkernel32 = syscall.NewLazyDLL("kernel32.dll")

	procCreateProcessWithLogonW = modadvapi32.NewProc("CreateProcessWithLogonW")
	procCreateProcessW          = modkernel32.NewProc("CreateProcessW")
)

const LOGON_WITH_PROFILE = 0x00000001

func CreateProcessWithLogon(
	username *uint16,
	domain *uint16,
	password *uint16,
	logonFlags uint32,
	appName *uint16,
	commandLine *uint16,
	creationFlags uint32,
	env *uint16,
	currentDir *uint16,
	startupInfo *syscall.StartupInfo,
	outProcInfo *syscall.ProcessInformation,
) (err error) {
	r1, _, e1 := syscall.Syscall12(
		procCreateProcessWithLogonW.Addr(),
		11,
		uintptr(unsafe.Pointer(username)),
		uintptr(unsafe.Pointer(domain)),
		uintptr(unsafe.Pointer(password)),
		uintptr(logonFlags),
		uintptr(unsafe.Pointer(appName)),
		uintptr(unsafe.Pointer(commandLine)),
		uintptr(creationFlags),
		uintptr(unsafe.Pointer(env)),
		uintptr(unsafe.Pointer(currentDir)),
		uintptr(unsafe.Pointer(startupInfo)),
		uintptr(unsafe.Pointer(outProcInfo)),
		0,
	)
	if r1 == 0 {
		if e1 != 0 {
			err = error(e1)
		} else {
			err = syscall.EINVAL
		}
	}
	return
}

func CreateProcess(
	appName *uint16,
	commandLine *uint16,
	procSecurity *syscall.SecurityAttributes,
	threadSecurity *syscall.SecurityAttributes,
	inheritHandles bool,
	creationFlags uint32,
	env *uint16,
	currentDir *uint16,
	startupInfo *syscall.StartupInfo,
	outProcInfo *syscall.ProcessInformation,
) (err error) {
	var _p0 uint32
	if inheritHandles {
		_p0 = 1
	} else {
		_p0 = 0
	}
	r1, _, e1 := syscall.Syscall12(procCreateProcessW.Addr(),
		10,
		uintptr(unsafe.Pointer(appName)),
		uintptr(unsafe.Pointer(commandLine)),
		uintptr(unsafe.Pointer(procSecurity)),
		uintptr(unsafe.Pointer(threadSecurity)),
		uintptr(_p0),
		uintptr(creationFlags),
		uintptr(unsafe.Pointer(env)),
		uintptr(unsafe.Pointer(currentDir)),
		uintptr(unsafe.Pointer(startupInfo)),
		uintptr(unsafe.Pointer(outProcInfo)),
		0,
		0,
	)
	if r1 == 0 {
		if e1 != 0 {
			err = error(e1)
		} else {
			err = syscall.EINVAL
		}
	}
	return
}
