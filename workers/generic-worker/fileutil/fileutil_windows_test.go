package fileutil

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/taskcluster/taskcluster/v110/workers/generic-worker/host"
	"golang.org/x/sys/windows"
)

func TestSecureFilesDropsExplicitEntries(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sekkrit")
	if err := os.WriteFile(path, []byte("{}"), 0600); err != nil {
		t.Fatalf("Could not create %v: %v", path, err)
	}

	// *S-1-1-0 is the Everyone group
	if err := host.Run("icacls", path, "/grant", "*S-1-1-0:(F)"); err != nil {
		t.Fatalf("Could not grant Everyone access to %v: %v", path, err)
	}

	if err := SecureFiles(path); err != nil {
		t.Fatalf("Could not secure %v: %v", path, err)
	}

	sd, err := windows.GetNamedSecurityInfo(path, windows.SE_FILE_OBJECT, windows.OWNER_SECURITY_INFORMATION|windows.DACL_SECURITY_INFORMATION)
	if err != nil {
		t.Fatalf("Could not read the security descriptor of %v: %v", path, err)
	}

	// Owned by the Administrators group (O:BA), with a DACL protected from
	// inheritance (D:P) holding one entry and no other: allow (A), carrying no
	// inheritance flags of its own, full control (FA), to that same group
	// (BA). Obviously.
	const expected = "O:BAD:P(A;;FA;;;BA)"
	if sddl := sd.String(); sddl != expected {
		t.Errorf("Security descriptor of %v is %q, expected %q", path, sddl, expected)
	}
}
