package win32

import (
	"fmt"
	"unsafe"

	"golang.org/x/sys/windows"
)

// NetLocalGroupAddMembers / NetLocalGroupDelMembers are not exposed by
// golang.org/x/sys/windows. See
// https://learn.microsoft.com/en-us/windows/win32/api/lmaccess/nf-lmaccess-netlocalgroupaddmembers
var (
	netapi32 = NewLazyDLL("netapi32.dll")

	procNetLocalGroupAddMembers = netapi32.NewProc("NetLocalGroupAddMembers")
	procNetLocalGroupDelMembers = netapi32.NewProc("NetLocalGroupDelMembers")
)

const localGroupMembersInfoLevel3 = 3

type localGroupMembersInfo3 struct {
	domainAndName *uint16
}

func netLocalGroupMembers(proc *LazyProcWrapper, group, member string) error {
	groupPtr, err := windows.UTF16PtrFromString(group)
	if err != nil {
		return err
	}
	memberPtr, err := windows.UTF16PtrFromString(member)
	if err != nil {
		return err
	}
	info := localGroupMembersInfo3{domainAndName: memberPtr}
	r0, _, _ := proc.Call(
		0, // local computer
		uintptr(unsafe.Pointer(groupPtr)),
		uintptr(localGroupMembersInfoLevel3),
		uintptr(unsafe.Pointer(&info)),
		1,
	)
	if r0 != 0 {
		return fmt.Errorf("%s group=%q member=%q: %w", proc.LazyProc.Name, group, member, windows.Errno(r0))
	}
	return nil
}

func AddLocalGroupMember(group, member string) error {
	return netLocalGroupMembers(procNetLocalGroupAddMembers, group, member)
}

func RemoveLocalGroupMember(group, member string) error {
	return netLocalGroupMembers(procNetLocalGroupDelMembers, group, member)
}
