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

const maxGrantDepth = 1024
const maxGrantErrors = 100

// This is winnt.h's FILE_ALL_ACCESS, which is missing from x/sys/windows...
const fileAllAccess = windows.STANDARD_RIGHTS_REQUIRED | windows.SYNCHRONIZE | 0x1FF

type granter struct {
	// The new owner
	sid            *windows.SID
	from           *windows.SID
	fromPrivileged bool
	errs           []error
	refused        int
}

func (g *granter) refuse(err error) {
	g.refused++
	if g.refused <= maxGrantErrors {
		g.errs = append(g.errs, err)
	}
}

func (g *granter) refusals(path string) error {
	err := errors.Join(g.errs...)
	if g.refused > maxGrantErrors {
		err = errors.Join(err, fmt.Errorf("%v further entries of %q were refused", g.refused-maxGrantErrors, path))
	}
	return err
}

func privilegedOwner(sid *windows.SID) bool {
	return sid == nil ||
		sid.IsWellKnown(windows.WinLocalSystemSid) ||
		sid.IsWellKnown(windows.WinBuiltinAdministratorsSid)
}

func (g *granter) mayTake(links uint32, owner *windows.SID) bool {
	if links <= 1 {
		return true
	}
	return !g.fromPrivileged && owner != nil && owner.Equals(g.from)
}

func readSecurity(handle windows.Handle, path string) (*windows.SECURITY_DESCRIPTOR, error) {
	sd, err := windows.GetSecurityInfo(handle, windows.SE_FILE_OBJECT, windows.OWNER_SECURITY_INFORMATION|windows.DACL_SECURITY_INFORMATION)
	if err != nil {
		return nil, fmt.Errorf("could not read the security descriptor of %q: %w", path, err)
	}
	return sd, nil
}

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

	root, err := safefs.OpenPathPinned(path, safefs.SecAccess)
	if err != nil {
		return err
	}
	defer func() { _ = windows.CloseHandle(root) }()

	dir, surrogate, err := safefs.Kind(root)
	if err != nil {
		return fmt.Errorf("could not stat %q: %w", path, err)
	}

	if !dir {
		links, err := safefs.NumberOfLinks(root)
		if err != nil {
			return fmt.Errorf("could not stat %q: %w", path, err)
		}
		if links > 1 {
			return fmt.Errorf("refusing to grant access to %q: the root is a hardlink", path)
		}
	}

	sd, err := readSecurity(root, path)
	if err != nil {
		return err
	}
	owner, _, err := sd.Owner()
	if err != nil {
		return fmt.Errorf("could not extract the owner of %q: %w", path, err)
	}

	g := &granter{sid: sid, from: owner, fromPrivileged: privilegedOwner(owner)}

	if err := g.grantNode(path, root, sd, dir); err != nil {
		return err
	}
	if !recurse || !dir || surrogate {
		return nil
	}

	g.grantChildren(root, path, 0)
	return g.refusals(path)
}

func (g *granter) grantNode(name string, handle windows.Handle, sd *windows.SECURITY_DESCRIPTOR, container bool) error {
	oldDACL, _, err := sd.DACL()
	if err != nil {
		return fmt.Errorf("could not extract DACL of %q: %w", name, err)
	}

	// Inheritance flags only mean anything on something that can have children
	inheritance := uint32(windows.NO_INHERITANCE)
	if container {
		inheritance = windows.SUB_CONTAINERS_AND_OBJECTS_INHERIT
	}

	access := []windows.EXPLICIT_ACCESS{{
		AccessPermissions: fileAllAccess,
		AccessMode:        windows.GRANT_ACCESS,
		Inheritance:       inheritance,
		Trustee: windows.TRUSTEE{
			TrusteeForm:  windows.TRUSTEE_IS_SID,
			TrusteeType:  windows.TRUSTEE_IS_USER,
			TrusteeValue: windows.TrusteeValueFromSID(g.sid),
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
	if err := newSD.SetOwner(g.sid, false); err != nil {
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

func (g *granter) grantChildren(handle windows.Handle, parentPath string, depth int) {
	if depth > maxGrantDepth {
		g.refuse(fmt.Errorf("refusing to descend into %q: more than %v levels deep", parentPath, maxGrantDepth))
		return
	}

	// handle was opened for its security descriptor, which doesn't imply the right
	// to list the directory, so reopen it
	parent, err := safefs.OpenSelf(handle, safefs.DirAccess)
	if err != nil {
		g.refuse(fmt.Errorf("could not reopen %q: %w", parentPath, err))
		return
	}
	dir := os.NewFile(uintptr(parent), parentPath)
	defer dir.Close()

	names, err := dir.Readdirnames(-1)
	if err != nil {
		g.refuse(fmt.Errorf("could not read directory %q: %w", parentPath, err))
		return
	}

	for _, name := range names {
		if err := g.grantChild(parent, name, parentPath, depth); err != nil {
			g.refuse(err)
		}
	}
}

func (g *granter) grantChild(parent windows.Handle, name, parentPath string, depth int) error {
	childPath := filepath.Join(parentPath, name)
	child, err := safefs.OpenChildPinned(parent, name, parentPath, safefs.SecAccess)
	if err != nil {
		return err
	}
	defer func() { _ = windows.CloseHandle(child) }()

	dir, surrogate, err := safefs.Kind(child)
	if err != nil {
		return fmt.Errorf("could not stat %q: %w", childPath, err)
	}

	sd, err := readSecurity(child, childPath)
	if err != nil {
		return err
	}

	if !dir {
		links, err := safefs.NumberOfLinks(child)
		if err != nil {
			return fmt.Errorf("could not stat %q: %w", childPath, err)
		}
		owner, _, err := sd.Owner()
		if err != nil {
			return fmt.Errorf("could not extract the owner of %q: %w", childPath, err)
		}
		if !g.mayTake(links, owner) {
			if g.fromPrivileged {
				return fmt.Errorf("refusing to grant access to %q: it's a hardlink and the tree is owned by a privileged account", childPath)
			}
			return fmt.Errorf("refusing to grant access to %q: it's a hardlink that doesn't belong to the previous owner of the tree", childPath)
		}
	}

	if err := g.grantNode(childPath, child, sd, dir); err != nil {
		return err
	}
	if !dir || surrogate {
		return nil
	}

	g.grantChildren(child, childPath, depth+1)
	return nil
}
