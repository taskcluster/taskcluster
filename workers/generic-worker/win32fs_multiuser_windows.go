//go:build multiuser

package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/taskcluster/taskcluster/v107/workers/generic-worker/safefs"
	"golang.org/x/sys/windows"
)

// Gives username ownership of path plus an inheritable full control ACE, and
// the same for every descendant if recurse is set.
func grantFullControl(path, username string, recurse bool) error {
	if err := safefs.EnsurePrivileges(); err != nil {
		return err
	}

	sid, _, _, err := windows.LookupSID("", username)
	if err != nil {
		return fmt.Errorf("could not look up SID for user %q: %w", username, err)
	}

	root, err := safefs.OpenReparseSafe(path, safefs.SecAccess)
	if err != nil {
		return err
	}
	defer func() { _ = windows.CloseHandle(root) }()

	attrs, tag, err := safefs.AttrsAndTag(root)
	if err != nil {
		return fmt.Errorf("could not stat %q: %w", path, err)
	}

	if safefs.IsNameSurrogate(attrs, tag) {
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
	return attrs&windows.FILE_ATTRIBUTE_DIRECTORY != 0 && !safefs.IsNameSurrogate(attrs, tag)
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
	parent, err := safefs.OpenSelf(handle, safefs.DirAccess)
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
	child, err := safefs.OpenChild(parent, name, parentPath, safefs.SecAccess)
	if err != nil {
		return err
	}
	defer func() { _ = windows.CloseHandle(child) }()

	if err := grantNode(childPath, child, sid); err != nil {
		return err
	}
	attrs, tag, err := safefs.AttrsAndTag(child)
	if err != nil {
		return fmt.Errorf("could not stat %q: %w", childPath, err)
	}
	if !shouldRecurse(attrs, tag) {
		return nil
	}
	return grantChildren(child, childPath, sid)
}
