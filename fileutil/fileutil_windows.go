package fileutil

import (
	"golang.org/x/sys/windows"

	acl "github.com/hectane/go-acl"
)

// SecureFiles modifies the discretionary access control list (DACL) of each
// file specified in filepaths to ensure that only members of the
// Administrators group have read/write access to it.
func SecureFiles(filepaths []string) (err error) {
	for _, path := range filepaths {
		err = acl.Apply(
			// file
			path,
			// delete existing permissions (ACLs)
			true,
			// don't inherit permissions (ACLs)
			false,
			// grant Administrators group full control
			acl.GrantName(windows.GENERIC_ALL, "Administrators"),
		)
	}
	return
}
