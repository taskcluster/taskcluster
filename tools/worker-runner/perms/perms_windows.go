// +build windows

package perms

import (
	"fmt"

	"golang.org/x/sys/windows"
)

const OWNER_ONLY_SDDL = "D:PAI(A;;FA;;;OW)"
const NOBODY = "S-1-0-0"

// MakePrivateToOwner ensures that the given file is private to the
// current user.
func MakePrivateToOwner(filename string) (err error) {
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
func VerifyPrivateToOwner(filename string) (err error) {
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
		return fmt.Errorf("File did not have expected DACL; got %s, expected %s", si, OWNER_ONLY_SDDL)
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
		return fmt.Errorf("File did not have expcted owner; got %s, expected %s", owner, currentUser)
	}

	if group.String() != NOBODY {
		return fmt.Errorf("File did not have expcted group; got %s, expected %s", group, NOBODY)
	}

	return
}

// Get the SID of the current user
func getCurrentUser() (sid *windows.SID, err error) {
	token, err := windows.OpenCurrentProcessToken()
	if err != nil {
		return
	}
	defer token.Close()

	tokenuser, err := token.GetTokenUser()
	sid = tokenuser.User.Sid
	return
}
