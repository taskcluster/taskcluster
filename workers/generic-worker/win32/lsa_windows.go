package win32

import (
	"fmt"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Nothing LSA related is exposed in x/sys/windows, because why would it be...
// Values/docs can be found at https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-lsad/b61b7268-987a-420b-84f9-6c75f8dc8558
// and https://learn.microsoft.com/en-us/windows/win32/secauthn/protecting-the-automatic-logon-password
var (
	procLsaOpenPolicy         = advapi32.NewProc("LsaOpenPolicy")
	procLsaClose              = advapi32.NewProc("LsaClose")
	procLsaStorePrivateData   = advapi32.NewProc("LsaStorePrivateData")
	procLsaNtStatusToWinError = advapi32.NewProc("LsaNtStatusToWinError")
)

const POLICY_CREATE_SECRET = 0x00000020

type lsaObjectAttributes struct {
	Length                   uint32
	RootDirectory            uintptr
	ObjectName               uintptr
	Attributes               uint32
	SecurityDescriptor       uintptr
	SecurityQualityOfService uintptr
}

func lsaStatus(status uintptr, fn string) error {
	if uint32(status) == 0 {
		return nil
	}
	winErr, _, _ := procLsaNtStatusToWinError.Call(status)
	return fmt.Errorf("%s: %w", fn, syscall.Errno(uint32(winErr)))
}

// Store a value under the LSA private-data key name as an encrypted secret.
func LsaStoreSecret(name, value string) error {
	oa := lsaObjectAttributes{}
	oa.Length = uint32(unsafe.Sizeof(oa))
	var policy uintptr
	status, _, _ := procLsaOpenPolicy.Call(
		0,
		uintptr(unsafe.Pointer(&oa)),
		POLICY_CREATE_SECRET,
		uintptr(unsafe.Pointer(&policy)),
	)
	if err := lsaStatus(status, "LsaOpenPolicy"); err != nil {
		return err
	}
	defer func() { _, _, _ = procLsaClose.Call(policy) }()

	key, err := windows.NewNTUnicodeString(name)
	if err != nil {
		return err
	}
	data, err := windows.NewNTUnicodeString(value)
	if err != nil {
		return err
	}
	status, _, _ = procLsaStorePrivateData.Call(
		policy,
		uintptr(unsafe.Pointer(key)),
		uintptr(unsafe.Pointer(data)),
	)
	return lsaStatus(status, "LsaStorePrivateData")
}
