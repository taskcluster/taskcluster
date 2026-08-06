// Package safefs resolves paths for privileged filesystem operations without
// letting an unprivileged user redirect them.
package safefs

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

func Kind(handle windows.Handle) (dir, surrogate bool, err error) {
	var info fileAttributeTagInfo
	if err := windows.GetFileInformationByHandleEx(handle, windows.FileAttributeTagInfo, (*byte)(unsafe.Pointer(&info)), uint32(unsafe.Sizeof(info))); err != nil {
		return false, false, err
	}

	// Name surrogates are reparse points that redirect the namespace, (i.e
	// junctions and links)
	const ioReparseTagNameSurrogate = 0x20000000
	dir = info.FileAttributes&windows.FILE_ATTRIBUTE_DIRECTORY != 0
	surrogate = info.FileAttributes&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0 && info.ReparseTag&ioReparseTagNameSurrogate != 0
	return dir, surrogate, nil
}

// Name **MUST** be a single entry and never a path or the whole thing breaks.
func checkName(name, parentPath string) error {
	if name == "" || name == "." || name == ".." || strings.ContainsAny(name, `\/`) {
		return fmt.Errorf("refusing to use unexpected entry name %q under %q. This is a worker bug", name, parentPath)
	}
	return nil
}

// NtCreateFile with a RootDirectory is the closest thing win32 has to openat(2).
func childAt(parent windows.Handle, name, parentPath string, access, disposition, options uint32) (windows.Handle, error) {
	if err := checkName(name, parentPath); err != nil {
		return windows.InvalidHandle, err
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
		disposition,
		windows.FILE_OPEN_REPARSE_POINT|windows.FILE_OPEN_FOR_BACKUP_INTENT|windows.FILE_SYNCHRONOUS_IO_NONALERT|options,
		0,
		0,
	); err != nil {
		return windows.InvalidHandle, fmt.Errorf("could not open %q under %q: %w", name, parentPath, err)
	}
	return handle, nil
}

func OpenChild(parent windows.Handle, name, parentPath string, access uint32) (windows.Handle, error) {
	return childAt(parent, name, parentPath, access, windows.FILE_OPEN, 0)
}

// Create a new name under an already open directory handle, failing if anything
// is already there.
func CreateChild(parent windows.Handle, name, parentPath string, access uint32, directory bool) (windows.Handle, error) {
	if directory {
		return childAt(parent, name, parentPath, access, windows.FILE_CREATE, windows.FILE_DIRECTORY_FILE)
	}
	return childAt(parent, name, parentPath, access, windows.FILE_CREATE, windows.FILE_NON_DIRECTORY_FILE)
}

// Removes whatever an already open handle refers to, which has to be opened
// with DELETE access and be an empty directory if it is one.
func DeleteSelf(handle windows.Handle, path string) error {
	disposition := uint32(windows.FILE_DISPOSITION_DELETE | windows.FILE_DISPOSITION_POSIX_SEMANTICS | windows.FILE_DISPOSITION_IGNORE_READONLY_ATTRIBUTE)
	var iosb windows.IO_STATUS_BLOCK
	if err := windows.NtSetInformationFile(handle, &iosb, (*byte)(unsafe.Pointer(&disposition)), uint32(unsafe.Sizeof(disposition)), windows.FileDispositionInformationEx); err != nil {
		return fmt.Errorf("could not delete %q: %w", path, err)
	}
	return nil
}

// Removes name from an already open directory handle. If a directory, it has
// to be empty first.
func DeleteChild(parent windows.Handle, name, parentPath string) error {
	child, err := OpenChild(parent, name, parentPath, windows.DELETE|windows.SYNCHRONIZE)
	if err != nil {
		return err
	}
	defer func() { _ = windows.CloseHandle(child) }()

	return DeleteSelf(child, filepath.Join(parentPath, name))
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
	if path == "" {
		return "", nil, errors.New("refusing to operate on an empty path")
	}

	separator := func(r rune) bool { return r == '\\' || r == '/' }

	abs, err := filepath.Abs(path)
	if err != nil {
		return "", nil, fmt.Errorf("could not resolve %q: %w", path, err)
	}

	volume := filepath.VolumeName(abs)
	if volume == "" {
		return "", nil, fmt.Errorf("refusing to operate on %q: it isn't a path under a volume", path)
	}
	return volume + `\`, strings.FieldsFunc(abs[len(volume):], separator), nil
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

	if len(components) == 0 {
		return openVolumeRoot(root, leafAccess)
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

		_, surrogate, err := Kind(handle)
		if err != nil {
			_ = windows.CloseHandle(handle)
			return windows.InvalidHandle, fmt.Errorf("could not stat %q: %w", current, err)
		}
		if surrogate {
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

func OpenExistingReadonly(file string) (*os.File, error) {
	handle, err := OpenPath(file, windows.GENERIC_READ|windows.SYNCHRONIZE)
	if err != nil {
		return nil, err
	}
	return os.NewFile(uintptr(handle), file), nil
}

func Create(file string, perm os.FileMode) (*os.File, error) {
	parent, name, err := OpenParent(file, traverseAccess|windows.FILE_WRITE_DATA|windows.FILE_APPEND_DATA)
	if err != nil {
		return nil, err
	}
	defer func() { _ = windows.CloseHandle(parent) }()

	handle, err := childAt(parent, name, filepath.Dir(file), windows.GENERIC_WRITE|windows.SYNCHRONIZE, windows.FILE_OVERWRITE_IF, windows.FILE_NON_DIRECTORY_FILE)
	if err != nil {
		return nil, err
	}
	return os.NewFile(uintptr(handle), file), nil
}

// FILE_RENAME_INFORMATION, which x/sys/windows doesn't declare
type fileRenameInformation struct {
	ReplaceIfExists uint32
	RootDirectory   windows.Handle
	FileNameLength  uint32
	FileName        [1]uint16
}

// OpenParent opens the directory holding path and returns it along with the
// name of path within it.
func OpenParent(path string, access uint32) (windows.Handle, string, error) {
	root, components, err := splitAbsPath(path)
	if err != nil {
		return windows.InvalidHandle, "", err
	}
	if len(components) == 0 {
		return windows.InvalidHandle, "", fmt.Errorf("refusing to operate on %q: it's a volume root", path)
	}

	name := components[len(components)-1]
	parent := filepath.Join(append([]string{root}, components[:len(components)-1]...)...)
	handle, err := OpenPath(parent, access)
	if err != nil {
		return windows.InvalidHandle, "", err
	}
	return handle, name, nil
}

// Removes path, which has to be an empty directory if it is one
func Remove(path string) error {
	parent, name, err := OpenParent(path, traverseAccess)
	if err != nil {
		return err
	}
	defer func() { _ = windows.CloseHandle(parent) }()

	return DeleteChild(parent, name, filepath.Dir(path))
}

// Whether path is an existing directory
func IsExistingDir(path string) bool {
	handle, err := OpenPath(path, windows.FILE_READ_ATTRIBUTES|windows.SYNCHRONIZE)
	if err != nil {
		return false
	}
	defer func() { _ = windows.CloseHandle(handle) }()

	dir, _, err := Kind(handle)
	return err == nil && dir
}

// This moves oldpath to newpath without either of them being resolved by
// name. A rename cannot cross volumes; that comes back as
// windows.STATUS_NOT_SAME_DEVICE.
func Rename(oldpath, newpath string) error {
	source, err := OpenPath(oldpath, windows.DELETE|windows.FILE_READ_ATTRIBUTES|windows.SYNCHRONIZE)
	if err != nil {
		return err
	}
	defer func() { _ = windows.CloseHandle(source) }()

	parent, name, err := OpenParent(newpath, traverseAccess|windows.FILE_WRITE_DATA|windows.FILE_APPEND_DATA)
	if err != nil {
		return err
	}
	defer func() { _ = windows.CloseHandle(parent) }()

	utf16Name, err := windows.UTF16FromString(name)
	if err != nil {
		return err
	}
	// UTF16FromString appends a terminator, which the length must not count
	nameLen := len(utf16Name)*2 - 2

	var info fileRenameInformation
	size := int(unsafe.Offsetof(info.FileName)) + nameLen
	buffer := make([]byte, size)
	rename := (*fileRenameInformation)(unsafe.Pointer(&buffer[0]))
	rename.ReplaceIfExists = windows.FILE_RENAME_REPLACE_IF_EXISTS
	rename.RootDirectory = parent
	rename.FileNameLength = uint32(nameLen)
	// capped at the name itself, the buffer has no room for the terminator
	copy(unsafe.Slice(&rename.FileName[0], nameLen/2), utf16Name)

	var iosb windows.IO_STATUS_BLOCK
	if err := windows.NtSetInformationFile(source, &iosb, &buffer[0], uint32(size), windows.FileRenameInformation); err != nil {
		return fmt.Errorf("could not rename %q to %q: %w", oldpath, newpath, err)
	}
	return nil
}
