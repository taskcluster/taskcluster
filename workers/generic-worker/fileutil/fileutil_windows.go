package fileutil

import (
	"fmt"

	"github.com/taskcluster/taskcluster/v110/workers/generic-worker/safefs"
	"golang.org/x/sys/windows"
)

// SecureFiles replaces the security descriptor of each path in filepaths with
// a protected DACL giving full control to members of the Administrators group
// and nothing to anyone else. It also hands ownership to them. Only regular
// files are accepted.
func SecureFiles(filepaths ...string) error {
	administrators, err := windows.CreateWellKnownSid(windows.WinBuiltinAdministratorsSid)
	if err != nil {
		return fmt.Errorf("could not look up the SID of the Administrators group: %w", err)
	}

	dacl, err := windows.ACLFromEntries([]windows.EXPLICIT_ACCESS{{
		AccessPermissions: safefs.FileAllAccess,
		AccessMode:        windows.GRANT_ACCESS,
		Inheritance:       windows.NO_INHERITANCE,
		Trustee: windows.TRUSTEE{
			TrusteeForm:  windows.TRUSTEE_IS_SID,
			TrusteeType:  windows.TRUSTEE_IS_GROUP,
			TrusteeValue: windows.TrusteeValueFromSID(administrators),
		},
	}}, nil)
	if err != nil {
		return fmt.Errorf("could not build a DACL granting the Administrators group full control: %w", err)
	}

	sd, err := windows.NewSecurityDescriptor()
	if err != nil {
		return fmt.Errorf("could not create a security descriptor: %w", err)
	}
	if err := sd.SetOwner(administrators, false); err != nil {
		return fmt.Errorf("could not set the owner in the security descriptor: %w", err)
	}
	if err := sd.SetDACL(dacl, true, false); err != nil {
		return fmt.Errorf("could not set the DACL in the security descriptor: %w", err)
	}
	if err := sd.SetControl(windows.SE_DACL_PROTECTED, windows.SE_DACL_PROTECTED); err != nil {
		return fmt.Errorf("could not protect the DACL in the security descriptor: %w", err)
	}

	for _, path := range filepaths {
		if err := secureFile(path, sd); err != nil {
			return err
		}
	}
	return nil
}

func secureFile(path string, sd *windows.SECURITY_DESCRIPTOR) error {
	handle, err := safefs.OpenPathPinned(path, safefs.SecAccess)
	if err != nil {
		return err
	}
	defer func() { _ = windows.CloseHandle(handle) }()

	if err := safefs.RefuseIfIrregular(handle, path); err != nil {
		return err
	}

	if err := windows.SetKernelObjectSecurity(handle, windows.OWNER_SECURITY_INFORMATION|windows.DACL_SECURITY_INFORMATION, sd); err != nil {
		return fmt.Errorf("could not set the owner/DACL of %q: %w", path, err)
	}
	return nil
}
