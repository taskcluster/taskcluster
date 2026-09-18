//go:build multiuser

package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/taskcluster/taskcluster/v110/workers/generic-worker/safefs"
	"golang.org/x/sys/windows"
)

const maxGrantDepth = 1024
const maxGrantErrors = 100

type granter struct {
	// The new owner
	sid            *windows.SID
	admins         *windows.SID
	system         *windows.SID
	from           *windows.SID
	fromPrivileged bool
	takeOwnership  bool
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
	if owner == nil {
		return false
	}
	if !g.fromPrivileged && owner.Equals(g.from) {
		return true
	}

	return !privilegedOwner(g.sid) && owner.Equals(g.sid)
}

func readOwner(handle windows.Handle, path string) (*windows.SID, error) {
	sd, err := windows.GetSecurityInfo(handle, windows.SE_FILE_OBJECT, windows.OWNER_SECURITY_INFORMATION)
	if err != nil {
		return nil, fmt.Errorf("could not read the owner of %q: %w", path, err)
	}
	owner, _, err := sd.Owner()
	if err != nil {
		return nil, fmt.Errorf("could not extract the owner of %q: %w", path, err)
	}
	return owner, nil
}

// grantFullControl replaces the DACL of path with a protected descriptor
// granting inheritable full control to username, Administrators, and SYSTEM,
// and takes ownership as username. Descendants are updated if recurse is set.
func grantFullControl(path, username string, recurse bool) error {
	sid, _, _, err := windows.LookupSID("", username)
	if err != nil {
		return fmt.Errorf("could not look up SID for user %q: %w", username, err)
	}
	return grantTo(path, sid, recurse, true)
}

func grantTo(path string, sid *windows.SID, recurse, takeOwnership bool) error {
	if err := safefs.EnsurePrivileges(); err != nil {
		return err
	}

	admins, err := windows.CreateWellKnownSid(windows.WinBuiltinAdministratorsSid)
	if err != nil {
		return fmt.Errorf("could not look up the SID of the Administrators group: %w", err)
	}
	system, err := windows.CreateWellKnownSid(windows.WinLocalSystemSid)
	if err != nil {
		return fmt.Errorf("could not look up the SID of SYSTEM: %w", err)
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

	owner, err := readOwner(root, path)
	if err != nil {
		return err
	}

	g := &granter{sid: sid, admins: admins, system: system, from: owner, fromPrivileged: privilegedOwner(owner), takeOwnership: takeOwnership}

	if err := g.grantNode(path, root, dir); err != nil {
		return err
	}
	if !recurse || !dir || surrogate {
		return nil
	}

	g.grantChildren(root, path, 0)
	return g.refusals(path)
}

func fullControlACE(sid *windows.SID, trusteeType windows.TRUSTEE_TYPE, inheritance uint32) windows.EXPLICIT_ACCESS {
	return windows.EXPLICIT_ACCESS{
		AccessPermissions: safefs.FileAllAccess,
		AccessMode:        windows.GRANT_ACCESS,
		Inheritance:       inheritance,
		Trustee: windows.TRUSTEE{
			TrusteeForm:  windows.TRUSTEE_IS_SID,
			TrusteeType:  trusteeType,
			TrusteeValue: windows.TrusteeValueFromSID(sid),
		},
	}
}

func (g *granter) grantNode(name string, handle windows.Handle, container bool) error {
	// Inheritance flags only mean anything on something that can have children
	inheritance := uint32(windows.NO_INHERITANCE)
	if container {
		inheritance = windows.SUB_CONTAINERS_AND_OBJECTS_INHERIT
	}

	access := []windows.EXPLICIT_ACCESS{
		fullControlACE(g.admins, windows.TRUSTEE_IS_GROUP, inheritance),
		fullControlACE(g.system, windows.TRUSTEE_IS_USER, inheritance),
	}
	if !g.sid.Equals(g.system) && !g.sid.Equals(g.admins) {
		access = append([]windows.EXPLICIT_ACCESS{
			fullControlACE(g.sid, windows.TRUSTEE_IS_USER, inheritance),
		}, access...)
	}
	newDACL, err := windows.ACLFromEntries(access, nil)
	if err != nil {
		return fmt.Errorf("could not build DACL for %q: %w", name, err)
	}

	newSD, err := windows.NewSecurityDescriptor()
	if err != nil {
		return err
	}
	info := windows.SECURITY_INFORMATION(windows.DACL_SECURITY_INFORMATION)
	if g.takeOwnership {
		if err := newSD.SetOwner(g.sid, false); err != nil {
			return fmt.Errorf("could not set owner in security descriptor for %q: %w", name, err)
		}
		info |= windows.OWNER_SECURITY_INFORMATION
	}
	if err := newSD.SetDACL(newDACL, true, false); err != nil {
		return fmt.Errorf("could not set DACL in security descriptor for %q: %w", name, err)
	}
	if err := newSD.SetControl(windows.SE_DACL_PROTECTED, windows.SE_DACL_PROTECTED); err != nil {
		return fmt.Errorf("could not protect the DACL in security descriptor for %q: %w", name, err)
	}
	if err := windows.SetKernelObjectSecurity(handle, info, newSD); err != nil {
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

	if !dir {
		links, err := safefs.NumberOfLinks(child)
		if err != nil {
			return fmt.Errorf("could not stat %q: %w", childPath, err)
		}
		owner, err := readOwner(child, childPath)
		if err != nil {
			return err
		}
		if !g.mayTake(links, owner) {
			if g.fromPrivileged {
				return fmt.Errorf("refusing to grant access to %q: it's a hardlink and the tree is owned by a privileged account", childPath)
			}
			return fmt.Errorf("refusing to grant access to %q: it's a hardlink that doesn't belong to the previous owner of the tree", childPath)
		}
	}

	if err := g.grantNode(childPath, child, dir); err != nil {
		return err
	}
	if !dir || surrogate {
		return nil
	}

	g.grantChildren(child, childPath, depth+1)
	return nil
}

// secureCachePoolEntry replaces the pool entry's DACL with a protected
// SYSTEM/Administrators descriptor so a later task user cannot read it.
// Ownership is left unchanged so remount can still take intra-cache hardlinks.
func secureCachePoolEntry(path string) error {
	system, err := windows.CreateWellKnownSid(windows.WinLocalSystemSid)
	if err != nil {
		return fmt.Errorf("could not look up the SID of SYSTEM: %w", err)
	}
	return grantTo(path, system, true, false)
}
