// Package safefs resolves paths for privileged filesystem operations without
// letting an unprivileged user redirect them.
package safefs

import (
	"fmt"
	"runtime"
	"strings"
	"sync"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	SecAccess uint32 = windows.FILE_READ_ATTRIBUTES | windows.READ_CONTROL | windows.WRITE_DAC | windows.WRITE_OWNER | windows.SYNCHRONIZE
	DirAccess uint32 = SecAccess | windows.FILE_LIST_DIRECTORY
)

var EnsurePrivileges = sync.OnceValue(enablePrivileges)

// Enables the token privileges needed to give away ownership and to open
// handles that bypass ACLs.
func enablePrivileges() error {
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

// fileAttributeTagInfo mirrors FILE_ATTRIBUTE_TAG_INFO, which x/sys/windows does
// not declare for some reason
type fileAttributeTagInfo struct {
	FileAttributes uint32
	ReparseTag     uint32
}

func AttrsAndTag(handle windows.Handle) (attrs, tag uint32, err error) {
	var info fileAttributeTagInfo
	if err := windows.GetFileInformationByHandleEx(handle, windows.FileAttributeTagInfo, (*byte)(unsafe.Pointer(&info)), uint32(unsafe.Sizeof(info))); err != nil {
		return 0, 0, err
	}

	return info.FileAttributes, info.ReparseTag, nil
}

func IsNameSurrogate(attrs, tag uint32) bool {
	// Name surrogates are reparse points that redirect the namespace, (i.e
	// junctions and links)
	const ioReparseTagNameSurrogate = 0x20000000
	return attrs&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0 && tag&ioReparseTagNameSurrogate != 0
}

// NtCreateFile with a RootDirectory is the closest thing win32 has to openat(2).
// Name **MUST** be a single entry and never a path or the whole thing breaks.
func OpenChild(parent windows.Handle, name, parentPath string, access uint32) (windows.Handle, error) {
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

func OpenSelf(handle windows.Handle, access uint32) (windows.Handle, error) {
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

func OpenReparseSafe(path string, access uint32) (windows.Handle, error) {
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
