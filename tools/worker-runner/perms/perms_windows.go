//go:build windows

package perms

import (
	"fmt"
	"os"

	"golang.org/x/sys/windows"
)

const OWNER_ONLY_SDDL = "D:PAI(A;;FA;;;OW)"
const NOBODY = "S-1-0-0"

// Make a private file that is only readable by the current user.
func WritePrivateFile(filename string, content []byte) error {
	if filename == "" {
		// regression check for
		// https://bugzilla.mozilla.org/show_bug.cgi?id=1594353
		panic("empty filename passed to WritePrivateFile")
	}

	// NOTE: Go largely ignores permissions bits in os.OpenFile on Windows, so
	// we must manage permissions directly

	// Begin by creating empty file so that we can adjust the permissions before
	// putting any sensitive content into it
	f, err := os.OpenFile(filename, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return fmt.Errorf("could not open %s for writing: %w", filename, err)
	}

	err = makePrivateToOwner(filename)
	if err != nil {
		_ = f.Close()
		return err
	}

	_, err = f.Write(content)
	if err1 := f.Close(); err == nil {
		err = err1
	}
	if err != nil {
		return fmt.Errorf("could not write to file %s: %w", filename, err)
	}

	return verifyPrivateToOwner(filename)
}

// Read a file, first verifying that it can only be read by the current user.
func ReadPrivateFile(filename string) ([]byte, error) {
	err := verifyPrivateToOwner(filename)
	if err != nil {
		return []byte{}, err
	}

	return os.ReadFile(filename)
}

// MakePrivateToOwner ensures that the given file is private to the
// current user.
func makePrivateToOwner(filename string) (err error) {
	if filename == "" {
		panic("empty filename passed to MakePrivateToOwner")
	}

	// get the current user's SID, which we will make the owner
	currentUser, err := getCurrentUser()
	if err != nil {
		return
	}

	// Use the well-known SID for "No security principal" as group
	group, err := windows.StringToSid(NOBODY)
	if err != nil {
		return
	}

	// and create a DACL (D:) protected from inheritance (P) and automatically
	// inherited by children (AI) that allows (A) full access (FA) to the owner
	// (OW).
	si, err := windows.SecurityDescriptorFromString(OWNER_ONLY_SDDL)
	if err != nil {
		panic(err)
	}
	dacl, _, err := si.DACL()
	if err != nil {
		panic(err)
	}

	// use all of that to set the owner, group, and dacl for the file.
	err = windows.SetNamedSecurityInfo(
		filename,
		windows.SE_FILE_OBJECT,
		windows.OWNER_SECURITY_INFORMATION|
			windows.GROUP_SECURITY_INFORMATION|
			// note that the "P" in the dacl isn't enough; this bit protects
			// from inheriting parent objects' permissions
			windows.PROTECTED_DACL_SECURITY_INFORMATION|
			windows.DACL_SECURITY_INFORMATION,
		currentUser,
		group,
		dacl,
		nil)

	return
}

// VerifyPrivateToOwner verifies that the given file can only be read by the
// file's owner, returning an error if this is not the case, or cannot be
// determined.
func verifyPrivateToOwner(filename string) (err error) {
	// We want to check the owner, group, and DACL for this file.  The DACL
	// will be verified in its SDDL form, while the owner and group are
	// checked directly.
	si, err := windows.GetNamedSecurityInfo(
		filename,
		windows.SE_FILE_OBJECT,
		windows.DACL_SECURITY_INFORMATION)
	if err != nil {
		return
	}

	if si.String() != OWNER_ONLY_SDDL {
		return fmt.Errorf("file %s did not have expected DACL; got %s, expected %s", filename, si, OWNER_ONLY_SDDL)
	}

	si, err = windows.GetNamedSecurityInfo(
		filename,
		windows.SE_FILE_OBJECT,
		windows.OWNER_SECURITY_INFORMATION|windows.GROUP_SECURITY_INFORMATION)
	if err != nil {
		return
	}

	owner, _, err := si.Owner()
	if err != nil {
		return
	}
	group, _, err := si.Group()
	if err != nil {
		return
	}

	currentUser, err := getCurrentUser()
	if err != nil {
		return
	}

	if owner.String() != currentUser.String() {
		return fmt.Errorf("file %s did not have expcted owner; got %s, expected %s", filename, owner, currentUser)
	}

	if group.String() != NOBODY {
		return fmt.Errorf("file %s did not have expcted group; got %s, expected %s", filename, group, NOBODY)
	}

	return
}

// Get the SID of the current user
func getCurrentUser() (*windows.SID, error) {
	token := windows.GetCurrentProcessToken()
	tokenuser, err := token.GetTokenUser()
	sid := tokenuser.User.Sid
	return sid, err
}

// MakeFilePrivate ensures that the given file is accessible only by its
// owner. If the file already has an owner-only ACL, this is a no-op and the
// returned bool is false. If the file had looser ACLs, they are tightened
// to owner-only and the returned bool is true. To match the POSIX
// semantics, this function refuses to rewrite the owner of a file that
// belongs to a different user (which would also require SeTakeOwnership on
// Windows). An error is returned if the file cannot be stat'd, if it is
// owned by a different user, or if the ACLs cannot be modified.
func MakeFilePrivate(filename string) (bool, error) {
	if _, err := os.Stat(filename); err != nil {
		return false, err
	}

	if verifyErr := verifyPrivateToOwner(filename); verifyErr == nil {
		return false, nil
	}

	// Refuse to take ownership of a file owned by a different user.
	si, err := windows.GetNamedSecurityInfo(
		filename,
		windows.SE_FILE_OBJECT,
		windows.OWNER_SECURITY_INFORMATION)
	if err != nil {
		return false, fmt.Errorf("could not read owner of %s: %w", filename, err)
	}
	owner, _, err := si.Owner()
	if err != nil {
		return false, fmt.Errorf("could not read owner of %s: %w", filename, err)
	}
	currentUser, err := getCurrentUser()
	if err != nil {
		return false, err
	}
	if owner.String() != currentUser.String() {
		return false, fmt.Errorf("%s is owned by %s (expected %s); refusing to tighten permissions on a file owned by another user", filename, owner, currentUser)
	}

	if err := makePrivateToOwner(filename); err != nil {
		return false, fmt.Errorf("could not tighten ACLs on %s: %w", filename, err)
	}

	if err := verifyPrivateToOwner(filename); err != nil {
		return true, fmt.Errorf("file %s is still not private after tightening: %w", filename, err)
	}

	return true, nil
}
