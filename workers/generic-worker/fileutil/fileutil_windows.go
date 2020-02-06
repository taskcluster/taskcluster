package fileutil

import (
	"github.com/taskcluster/generic-worker/host"
)

// SecureFiles modifies the discretionary access control list (DACL) of each
// file specified in filepaths to ensure that only members of the
// Administrators group have read/write access to it.
func SecureFiles(filepaths ...string) (err error) {
	for _, path := range filepaths {
		err = host.Run("icacls", path, "/grant:r", "Administrators:(GA)", "/inheritance:r")
		if err != nil {
			return
		}
	}
	return
}
