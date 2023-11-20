package fileutil

import (
	"fmt"
	"io/fs"

	"github.com/taskcluster/taskcluster/v58/workers/generic-worker/host"
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

func ResetPermissions(path string, permissions fs.FileMode) error {
	return host.Run("icacls", path, "/reset", "/t")
}

func GetPermissionsString(path string) (string, error) {
	return host.CombinedOutput("icacls", path)
}

func GetPermissions(path string) (fs.FileMode, error) {
	return 0, fmt.Errorf("GetPermissions not implemented on Windows")
}
