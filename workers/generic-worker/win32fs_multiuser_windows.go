//go:build multiuser

package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	secAccess uint32 = windows.FILE_READ_ATTRIBUTES | windows.READ_CONTROL | windows.WRITE_DAC | windows.WRITE_OWNER | windows.SYNCHRONIZE
	dirAccess uint32 = secAccess | windows.FILE_LIST_DIRECTORY
)

var ensureOwnershipPrivileges = sync.OnceValue(enableOwnershipPrivileges)

// Enables the token privileges needed to give away ownership and to open
// handles that bypass ACLs.
func enableOwnershipPrivileges() error {
	// Ensure we read our own errors with `GetLastError`
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	var token windows.Token
	if err := windows.OpenProcessToken(windows.CurrentProcess(), windows.TOKEN_ADJUST_PRIVILEGES|windows.TOKEN_QUERY, &token); err != nil {
		return fmt.Errorf("could not open process token to enable privileges: %w", err)
	}
	defer token.Close()

	for _, name := range []string{"SeRestorePrivilege", "SeBackupPrivilege"} {
		pname, err := windows.UTF16PtrFromString(name)
		if err != nil {
			return err
		}

		var luid windows.LUID
		if err := windows.LookupPrivilegeValue(nil, pname, &luid); err != nil {
			return fmt.Errorf("could not look up privilege %s: %w", name, err)
		}

		tp := windows.Tokenprivileges{PrivilegeCount: 1}
		tp.Privileges[0] = windows.LUIDAndAttributes{Luid: luid, Attributes: windows.SE_PRIVILEGE_ENABLED}
		if err := windows.AdjustTokenPrivileges(token, false, &tp, 0, nil, nil); err != nil {
			return fmt.Errorf("could not enable privilege %s: %w", name, err)
		}

		if err := windows.GetLastError(); err == windows.ERROR_NOT_ALL_ASSIGNED {
			return fmt.Errorf("privilege %s is not held by the worker process", name)
		}
	}
	return nil
}

// Gives username ownership of path plus an inheritable full control ACE, and
// the same for every descendant if recurse is set.
func grantFullControl(path, username string, recurse bool) error {
	if err := ensureOwnershipPrivileges(); err != nil {
		return err
	}

	sid, _, _, err := windows.LookupSID("", username)
	if err != nil {
		return fmt.Errorf("could not look up SID for user %q: %w", username, err)
	}

	root, err := openReparseSafe(path, secAccess)
	if err != nil {
		return err
	}
	defer func() { _ = windows.CloseHandle(root) }()

	attrs, tag, err := attrsAndTag(root)
	if err != nil {
		return fmt.Errorf("could not stat %q: %w", path, err)
	}

	if isNameSurrogate(attrs, tag) {
		return fmt.Errorf("refusing to operate on %q: it's a junction or a link", path)
	}

	if err := grantNode(path, root, sid); err != nil {
		return err
	}
	if !recurse || !shouldRecurse(attrs, tag) {
		return nil
	}
	return grantChildren(root, path, sid)
}

func shouldRecurse(attrs, tag uint32) bool {
	return attrs&windows.FILE_ATTRIBUTE_DIRECTORY != 0 && !isNameSurrogate(attrs, tag)
}

// fileAttributeTagInfo mirrors FILE_ATTRIBUTE_TAG_INFO, which x/sys/windows does
// not declare for some reason
type fileAttributeTagInfo struct {
	FileAttributes uint32
	ReparseTag     uint32
}

func attrsAndTag(handle windows.Handle) (attrs, tag uint32, err error) {
	var info fileAttributeTagInfo
	if err := windows.GetFileInformationByHandleEx(handle, windows.FileAttributeTagInfo, (*byte)(unsafe.Pointer(&info)), uint32(unsafe.Sizeof(info))); err != nil {
		return 0, 0, err
	}

	return info.FileAttributes, info.ReparseTag, nil
}

func isNameSurrogate(attrs, tag uint32) bool {
	// Name surrogates are reparse points that redirect the namespace, (i.e
	// junctions and links)
	const ioReparseTagNameSurrogate = 0x20000000
	return attrs&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0 && tag&ioReparseTagNameSurrogate != 0
}

func grantNode(name string, handle windows.Handle, sid *windows.SID) error {
	sd, err := windows.GetSecurityInfo(handle, windows.SE_FILE_OBJECT, windows.DACL_SECURITY_INFORMATION)
	if err != nil {
		return fmt.Errorf("could not read DACL of %q: %w", name, err)
	}

	oldDACL, _, err := sd.DACL()
	if err != nil {
		return fmt.Errorf("could not extract DACL of %q: %w", name, err)
	}

	// This is winnt.h's FILE_ALL_ACCESS, which is missing from x/sys/windows...
	const fileAllAccess = windows.STANDARD_RIGHTS_REQUIRED | windows.SYNCHRONIZE | 0x1FF

	access := []windows.EXPLICIT_ACCESS{{
		AccessPermissions: fileAllAccess,
		AccessMode:        windows.GRANT_ACCESS,
		Inheritance:       windows.SUB_CONTAINERS_AND_OBJECTS_INHERIT,
		Trustee: windows.TRUSTEE{
			TrusteeForm:  windows.TRUSTEE_IS_SID,
			TrusteeType:  windows.TRUSTEE_IS_USER,
			TrusteeValue: windows.TrusteeValueFromSID(sid),
		},
	}}
	newDACL, err := windows.ACLFromEntries(access, oldDACL)
	if err != nil {
		return fmt.Errorf("could not build DACL for %q: %w", name, err)
	}

	newSD, err := windows.NewSecurityDescriptor()
	if err != nil {
		return err
	}
	if err := newSD.SetOwner(sid, false); err != nil {
		return fmt.Errorf("could not set owner in security descriptor for %q: %w", name, err)
	}
	if err := newSD.SetDACL(newDACL, true, false); err != nil {
		return fmt.Errorf("could not set DACL in security descriptor for %q: %w", name, err)
	}
	if err := windows.SetKernelObjectSecurity(handle, windows.OWNER_SECURITY_INFORMATION|windows.DACL_SECURITY_INFORMATION, newSD); err != nil {
		return fmt.Errorf("could not set owner/DACL on %q: %w", name, err)
	}
	return nil
}

func grantChildren(handle windows.Handle, parentPath string, sid *windows.SID) error {
	// handle was opened for its security descriptor, which doesn't imply the right
	// to list the directory, so reopen it
	parent, err := openSelf(handle, dirAccess)
	if err != nil {
		return fmt.Errorf("could not reopen %q: %w", parentPath, err)
	}
	dir := os.NewFile(uintptr(parent), parentPath)
	defer dir.Close()

	names, err := dir.Readdirnames(-1)
	if err != nil {
		return fmt.Errorf("could not read directory %q: %w", parentPath, err)
	}

	var errs []error
	for _, name := range names {
		if err := grantChild(parent, name, parentPath, sid); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func grantChild(parent windows.Handle, name, parentPath string, sid *windows.SID) error {
	childPath := filepath.Join(parentPath, name)
	child, err := openChildRelative(parent, name, parentPath, secAccess)
	if err != nil {
		return err
	}
	defer func() { _ = windows.CloseHandle(child) }()

	if err := grantNode(childPath, child, sid); err != nil {
		return err
	}
	attrs, tag, err := attrsAndTag(child)
	if err != nil {
		return fmt.Errorf("could not stat %q: %w", childPath, err)
	}
	if !shouldRecurse(attrs, tag) {
		return nil
	}
	return grantChildren(child, childPath, sid)
}

// NtCreateFile with a RootDirectory is the closest thing win32 has to openat(2).
// Name **MUST** be a single entry and never a path or the whole thing breaks.
func openChildRelative(parent windows.Handle, name, parentPath string, access uint32) (windows.Handle, error) {
	if name == "" || name == "." || name == ".." || strings.Contains(name, `\`) {
		return windows.InvalidHandle, fmt.Errorf("refusing to open unexpected entry name %q under %q. This is a worker bug", name, parentPath)
	}

	objectName, err := windows.NewNTUnicodeString(name)
	if err != nil {
		return windows.InvalidHandle, err
	}
	oa := windows.OBJECT_ATTRIBUTES{
		RootDirectory: parent,
		ObjectName:    objectName,
		Attributes:    windows.OBJ_CASE_INSENSITIVE,
	}
	oa.Length = uint32(unsafe.Sizeof(oa))

	var handle windows.Handle
	var iosb windows.IO_STATUS_BLOCK
	if err := windows.NtCreateFile(
		&handle,
		access,
		&oa,
		&iosb,
		nil,
		0,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE,
		windows.FILE_OPEN,
		windows.FILE_OPEN_REPARSE_POINT|windows.FILE_OPEN_FOR_BACKUP_INTENT|windows.FILE_SYNCHRONOUS_IO_NONALERT,
		0,
		0,
	); err != nil {
		return windows.InvalidHandle, fmt.Errorf("could not open %q under %q: %w", name, parentPath, err)
	}
	return handle, nil
}

func openSelf(handle windows.Handle, access uint32) (windows.Handle, error) {
	empty, err := windows.NewNTUnicodeString("")
	if err != nil {
		return windows.InvalidHandle, err
	}
	oa := windows.OBJECT_ATTRIBUTES{
		RootDirectory: handle,
		ObjectName:    empty,
		Attributes:    windows.OBJ_CASE_INSENSITIVE,
	}
	oa.Length = uint32(unsafe.Sizeof(oa))

	var newHandle windows.Handle
	var iosb windows.IO_STATUS_BLOCK
	if err := windows.NtCreateFile(
		&newHandle,
		access,
		&oa,
		&iosb,
		nil,
		0,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE,
		windows.FILE_OPEN,
		windows.FILE_OPEN_FOR_BACKUP_INTENT|windows.FILE_SYNCHRONOUS_IO_NONALERT,
		0,
		0,
	); err != nil {
		return windows.InvalidHandle, err
	}
	return newHandle, nil
}

func openReparseSafe(path string, access uint32) (windows.Handle, error) {
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return windows.InvalidHandle, err
	}

	handle, err := windows.CreateFile(
		p,
		access,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE,
		nil,
		windows.OPEN_EXISTING,
		windows.FILE_FLAG_BACKUP_SEMANTICS|windows.FILE_FLAG_OPEN_REPARSE_POINT,
		0,
	)

	if err != nil {
		return windows.InvalidHandle, fmt.Errorf("could not open %q: %w", path, err)
	}

	return handle, nil
}
