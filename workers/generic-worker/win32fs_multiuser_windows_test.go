//go:build multiuser

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/taskcluster/taskcluster/v107/workers/generic-worker/host"
)

func mkjunction(t *testing.T, link, target string) {
	t.Helper()
	if err := host.Run("cmd", "/c", "mklink", "/J", link, target); err != nil {
		t.Fatalf("mklink %q -> %q: %v", link, target, err)
	}
}

func restrictToAdmins(t *testing.T, path string) {
	t.Helper()
	// *S-1-5-32-544 = BUILTIN\Administrators, *S-1-5-18 = NT AUTHORITY\SYSTEM
	if err := host.Run("icacls", path, "/inheritance:r", "/grant:r", "*S-1-5-32-544:(OI)(CI)F", "*S-1-5-18:(OI)(CI)F"); err != nil {
		t.Fatalf("could not restrict ACL of %q: %v", path, err)
	}
	if err := host.Run("icacls", path, "/setowner", "*S-1-5-18", "/T"); err != nil {
		t.Fatalf("could not set owner of %q: %v", path, err)
	}
}

func grantedTo(t *testing.T, path, user string) bool {
	t.Helper()
	// 0x1F01FF is FILE_ALL_ACCESS
	cmd := fmt.Sprintf(`if ((Get-Acl -LiteralPath '%s').Access | Where-Object { $_.IdentityReference.Value.Split('\')[-1] -eq '%s' -and $_.AccessControlType -eq 'Allow' -and ([int]$_.FileSystemRights -band 0x1F01FF) -eq 0x1F01FF }) { 'yes' } else { 'no' }`, path, user)
	out, err := host.Output("powershell", "-NoProfile", "-NonInteractive", "-Command", cmd)
	if err != nil {
		t.Fatalf("could not read ACL of %q: %v", path, err)
	}
	return strings.TrimSpace(out) == "yes"
}

func mkAdminOnlySecret(t *testing.T, base string) (secret, secretFile string) {
	t.Helper()
	secret = filepath.Join(base, "secret")
	secretFile = filepath.Join(secret, "leaf", "secret.txt")
	if err := os.MkdirAll(filepath.Dir(secretFile), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(secretFile, []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	restrictToAdmins(t, secret)
	return secret, secretFile
}

func TestGrantFullControl(t *testing.T) {
	setup(t)

	taskUser := taskContext.User.Name
	base := t.TempDir()
	secret, secretFile := mkAdminOnlySecret(t, base)
	owner := ownerOf(t, secretFile)

	untouched := func(t *testing.T) {
		t.Helper()
		if got := ownerOf(t, secretFile); got != owner {
			t.Errorf("secret owner = %q, was %q", got, owner)
		}
		if grantedTo(t, secretFile, taskUser) {
			t.Error("task user gained an ACE on the secret")
		}
	}

	t.Run("does not follow a nested junction", func(t *testing.T) {
		cache := filepath.Join(base, "cache")
		realFile := filepath.Join(cache, "real", "f0.txt")
		if err := os.MkdirAll(filepath.Dir(realFile), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(realFile, []byte("y"), 0o600); err != nil {
			t.Fatal(err)
		}
		mkjunction(t, filepath.Join(cache, "viajunction"), secret)

		if err := grantFullControl(cache, taskUser, true); err != nil {
			t.Fatal(err)
		}
		if got := ownerOf(t, realFile); got != taskUser {
			t.Errorf("cache file owner = %q, want %q", got, taskUser)
		}
		if !grantedTo(t, realFile, taskUser) {
			t.Error("task user was not granted the cache file")
		}
		untouched(t)
	})

	t.Run("refuses a junctioned prefix", func(t *testing.T) {
		stage := filepath.Join(base, "stage")
		mkjunction(t, stage, secret)

		if err := grantFullControl(filepath.Join(stage, "leaf"), taskUser, true); err == nil {
			t.Error("granted through a junctioned prefix")
		}
		untouched(t)
	})

	t.Run("refuses a junctioned root", func(t *testing.T) {
		link := filepath.Join(base, "toplink")
		mkjunction(t, link, secret)

		if err := grantFullControl(link, taskUser, true); err == nil {
			t.Error("granted through a junctioned root")
		}
		untouched(t)
	})
}

func TestRemoveAllDoesNotFollowJunctions(t *testing.T) {
	setup(t)
	base := t.TempDir()

	secret, secretFile := mkAdminOnlySecret(t, base)

	tree := filepath.Join(base, "tree")
	roFile := filepath.Join(tree, "sub", "readonly.txt")
	if err := os.MkdirAll(filepath.Dir(roFile), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(roFile, []byte("ro"), 0o600); err != nil {
		t.Fatal(err)
	}

	// generic-worker on windows relies on os.RemoveAll being reparse point
	// safe which it is since Go 1.25. That behavior is however undocumented,
	// so guard it here just in case... A read-only file plus a junction
	// escaping the tree. os.RemoveAll must delete the former and refuse to
	// follow the latter.
	if err := host.Run("attrib", "+r", roFile); err != nil {
		t.Fatalf("could not set read-only: %v", err)
	}
	mkjunction(t, filepath.Join(tree, "escape"), secret)

	if err := os.RemoveAll(tree); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(tree); !os.IsNotExist(err) {
		t.Errorf("tree still there, %v", err)
	}
	if _, err := os.Stat(secretFile); err != nil {
		t.Errorf("junction was followed, secret deleted: %v", err)
	}
}
