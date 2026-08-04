// Package safefs resolves paths for privileged filesystem operations without
// letting an unprivileged user redirect them.
package safefs

import (
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
	SecAccess      uint32 = windows.FILE_READ_ATTRIBUTES | windows.READ_CONTROL | windows.WRITE_DAC | windows.WRITE_OWNER | windows.SYNCHRONIZE
	DirAccess      uint32 = SecAccess | windows.FILE_LIST_DIRECTORY
	traverseAccess uint32 = windows.FILE_READ_ATTRIBUTES | windows.FILE_LIST_DIRECTORY | windows.SYNCHRONIZE
)

var ensurePrivileges = sync.OnceValue(enablePrivileges)

func EnsurePrivileges() error { return ensurePrivileges() }

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

// Open the volume root by name. This is the only part of a path we can trust to
// not be swapped by a task.
func openVolumeRoot(root string, access uint32) (windows.Handle, error) {
	p, err := windows.UTF16PtrFromString(root)
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
		return windows.InvalidHandle, fmt.Errorf("could not open %q: %w", root, err)
	}

	return handle, nil
}

// Splits an absolute path into its volume root and the components below it.
func splitAbsPath(path string) (string, []string, error) {
	separator := func(r rune) bool { return r == '\\' || r == '/' }

	abs, err := filepath.Abs(path)
	if err != nil {
		return "", nil, fmt.Errorf("could not resolve %q: %w", path, err)
	}

	volume := filepath.VolumeName(abs)
	components := strings.FieldsFunc(abs[len(volume):], separator)
	if volume == "" || len(components) == 0 {
		return "", nil, fmt.Errorf("refusing to operate on %q: it isn't a path below a volume root", path)
	}
	return volume + `\`, components, nil
}

// OpenPath opens path one component at a time, each one relative to the
// previously opened one, refusing to go on if any of them is a junction or a
// link.
func OpenPath(path string, leafAccess uint32) (windows.Handle, error) {
	// Every open below asks for FILE_OPEN_FOR_BACKUP_INTENT, which is silently
	// ignored unless the privileges backing it are enabled.
	if err := EnsurePrivileges(); err != nil {
		return windows.InvalidHandle, err
	}

	root, components, err := splitAbsPath(path)
	if err != nil {
		return windows.InvalidHandle, err
	}

	handle, err := openVolumeRoot(root, traverseAccess)
	if err != nil {
		return windows.InvalidHandle, err
	}

	current := root
	for i, name := range components {
		access := traverseAccess
		if i == len(components)-1 {
			access = leafAccess
		}

		child, err := OpenChild(handle, name, current, access)
		_ = windows.CloseHandle(handle)
		if err != nil {
			return windows.InvalidHandle, err
		}
		handle, current = child, filepath.Join(current, name)

		attrs, tag, err := AttrsAndTag(handle)
		if err != nil {
			_ = windows.CloseHandle(handle)
			return windows.InvalidHandle, fmt.Errorf("could not stat %q: %w", current, err)
		}
		if IsNameSurrogate(attrs, tag) {
			_ = windows.CloseHandle(handle)
			return windows.InvalidHandle, fmt.Errorf("refusing to resolve %q: %q is a junction or a link", path, current)
		}
	}
	return handle, nil
}

func OpenExistingRDWR(file string) (*os.File, error) {
	handle, err := OpenPath(file, windows.GENERIC_READ|windows.GENERIC_WRITE|windows.SYNCHRONIZE)
	if err != nil {
		return nil, err
	}
	return os.NewFile(uintptr(handle), file), nil
}
