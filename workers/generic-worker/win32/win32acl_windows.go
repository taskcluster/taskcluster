package win32

import (
	"os"
	"syscall"
	"unsafe"

	"runtime"
)

var (
	//	procGetUserObjectSecurity        = user32.NewProc("GetUserObjectSecurity")
	procSetUserObjectSecurity = user32.NewProc("SetUserObjectSecurity")

	//	procGetSecurityDescriptorDacl    = advapi32.NewProc("GetSecurityDescriptorDacl")
	procSetSecurityDescriptorDacl = advapi32.NewProc("SetSecurityDescriptorDacl")

	//	procIsValidAcl                   = advapi32.NewProc("IsValidAcl")
	//	procGetAclInformation            = advapi32.NewProc("GetAclInformation")
	procInitializeSecurityDescriptor = advapi32.NewProc("InitializeSecurityDescriptor")
	procInitializeAcl                = advapi32.NewProc("InitializeAcl")

	//	procAddAce                       = advapi32.NewProc("AddAce")
	//	procGetAce                       = advapi32.NewProc("GetAce")
	procAddAccessAllowedAce   = advapi32.NewProc("AddAccessAllowedAce")
	procAddAccessAllowedAceEx = advapi32.NewProc("AddAccessAllowedAceEx")
)

const (
	DACL_SECURITY_INFORMATION    = 0x00000004
	SECURITY_DESCRIPTOR_REVISION = 1
	ACL_REVISION                 = 2

	DESKTOP_CREATEMENU       = 0x4
	DESKTOP_CREATEWINDOW     = 0x2
	DESKTOP_ENUMERATE        = 0x40
	DESKTOP_HOOKCONTROL      = 0x8
	DESKTOP_JOURNALPLAYBACK  = 0x20
	DESKTOP_JOURNALRECORD    = 0x10
	DESKTOP_READOBJECTS      = 0x1
	DESKTOP_SWITCHDESKTOP    = 0x100
	DESKTOP_WRITEOBJECTS     = 0x80
	STANDARD_RIGHTS_REQUIRED = 0x000F0000
	READ_CONTROL             = 0x00020000

	DESKTOP_ALL = DESKTOP_CREATEMENU | DESKTOP_CREATEWINDOW | DESKTOP_ENUMERATE | DESKTOP_HOOKCONTROL |
		DESKTOP_JOURNALPLAYBACK | DESKTOP_JOURNALRECORD | DESKTOP_READOBJECTS | DESKTOP_SWITCHDESKTOP |
		DESKTOP_WRITEOBJECTS | READ_CONTROL

	WINSTA_ALL_ACCESS = 0x37F
	WINSTA_ALL        = WINSTA_ALL_ACCESS | READ_CONTROL

	CONTAINER_INHERIT_ACE    = 2
	INHERIT_ONLY_ACE         = 8
	OBJECT_INHERIT_ACE       = 1
	NO_PROPAGATE_INHERIT_ACE = 4
)

func SetAclTo(obj syscall.Handle, acl *Acl) error {
	desc, err := CreateSecurityDescriptor(4096)
	if err != nil {
		return err
	}
	if err = SetSecurityDescriptorDacl(desc, true, acl, false); err != nil {
		return err
	}
	return SetUserObjectSecurity(obj, DACL_SECURITY_INFORMATION, desc)
}

func CreateDesktopAllowAcl(sid *syscall.SID) (*Acl, error) {
	acl, err := CreateNewAcl(1024)
	if err != nil {
		return nil, err
	}
	if err = AddAccessAllowedAce(acl, ACL_REVISION, DESKTOP_ALL, sid); err != nil {
		return nil, err
	}
	return acl, nil
}

func AddAceToDesktop(desk Hdesk, sid *syscall.SID) error {
	acl, err := CreateDesktopAllowAcl(sid)
	if err != nil {
		return err
	}
	return SetAclTo(syscall.Handle(desk), acl)
}

func CreateWinstaAllowAcl(sid *syscall.SID) (*Acl, error) {
	acl, err := CreateNewAcl(1024)
	if err != nil {
		return nil, err
	}
	if err = AddAccessAllowedAceEx(acl, ACL_REVISION, CONTAINER_INHERIT_ACE|INHERIT_ONLY_ACE|OBJECT_INHERIT_ACE,
		syscall.GENERIC_ALL, sid); err != nil {
		return nil, err
	}
	if err = AddAccessAllowedAceEx(acl, ACL_REVISION, NO_PROPAGATE_INHERIT_ACE,
		WINSTA_ALL, sid); err != nil {
		return nil, err
	}
	return acl, nil
}

func AddAceToWindowStation(winsta Hwinsta, sid *syscall.SID) error {
	acl, err := CreateWinstaAllowAcl(sid)
	if err != nil {
		return err
	}
	return SetAclTo(syscall.Handle(winsta), acl)
}

// AlignedBuffer returns byte slice of given size, aligned at given offset.
func AlignedBuffer(size, offset int) []byte {
	buf := make([]byte, size+offset)
	ofs := int((uintptr(offset) - uintptr(unsafe.Pointer(&buf[0]))%uintptr(offset)) % uintptr(offset))
	return buf[ofs : ofs+size]
}

func CreateSecurityDescriptor(length int) ([]byte, error) {
	result := AlignedBuffer(length, 4)
	if err := InitializeSecurityDescriptor(result); err != nil {
		return nil, err
	}
	return result, nil
}

func CreateNewAcl(length int) (*Acl, error) {
	result := (*Acl)(unsafe.Pointer(&AlignedBuffer(length, 4)[0]))
	if err := InitializeAcl(result, uint32(length), ACL_REVISION); err != nil {
		return nil, err
	}
	return result, nil
}

func SetUserObjectSecurity(obj syscall.Handle, sid uint32, desc []byte) error {
	r1, _, e1 := procSetUserObjectSecurity.Call(
		uintptr(obj),
		uintptr(unsafe.Pointer(&sid)),
		uintptr(unsafe.Pointer(&desc[0])))
	runtime.KeepAlive(&sid)
	runtime.KeepAlive(&desc)
	if int(r1) == 0 {
		return os.NewSyscallError("SetUserObjectSecurity", e1)
	}
	return nil
}

type Acl struct{}

func InitializeSecurityDescriptor(sd []byte) error {
	r1, _, e1 := procInitializeSecurityDescriptor.Call(
		uintptr(unsafe.Pointer(&sd[0])),
		SECURITY_DESCRIPTOR_REVISION)
	runtime.KeepAlive(sd)
	if int(r1) == 0 {
		return os.NewSyscallError("InitializeSecurityDescriptor", e1)
	}
	return nil
}

func InitializeAcl(acl *Acl, length, revision uint32) error {
	r1, _, e1 := procInitializeAcl.Call(
		uintptr(unsafe.Pointer(acl)),
		uintptr(length),
		uintptr(revision))
	runtime.KeepAlive(acl)
	if int(r1) == 0 {
		return os.NewSyscallError("InitializeAcl", e1)
	}
	return nil
}

type AceHeader struct {
	AceType  byte
	AceFlags byte
	AceSize  uint16
}

type Ace struct{}

func AddAccessAllowedAce(acl *Acl, revision, mask uint32, sid *syscall.SID) error {
	r1, _, e1 := procAddAccessAllowedAce.Call(
		uintptr(unsafe.Pointer(acl)),
		uintptr(revision),
		uintptr(mask),
		uintptr(unsafe.Pointer(sid)))
	runtime.KeepAlive(acl)
	runtime.KeepAlive(sid)
	if int(r1) == 0 {
		return os.NewSyscallError("AddAccessAllowedAce", e1)
	}
	return nil
}

func SetSecurityDescriptorDacl(sd []byte, present bool, acl *Acl, defaulted bool) error {
	r1, _, e1 := procSetSecurityDescriptorDacl.Call(
		uintptr(unsafe.Pointer(&sd[0])),
		uintptr(boolToUint32(present)),
		uintptr(unsafe.Pointer(acl)),
		uintptr(boolToUint32(defaulted)))
	runtime.KeepAlive(sd)
	runtime.KeepAlive(acl)
	if int(r1) == 0 {
		return os.NewSyscallError("SetSecurityDescriptorDacl", e1)
	}
	return nil
}

func AddAccessAllowedAceEx(acl *Acl, revision, flags, mask uint32, sid *syscall.SID) error {
	r1, _, e1 := procAddAccessAllowedAceEx.Call(
		uintptr(unsafe.Pointer(acl)),
		uintptr(revision),
		uintptr(flags),
		uintptr(mask),
		uintptr(unsafe.Pointer(sid)))
	runtime.KeepAlive(acl)
	runtime.KeepAlive(sid)
	if int(r1) == 0 {
		return os.NewSyscallError("AddAccessAllowedAceEx", e1)
	}
	return nil
}
