//go:build multiuser

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"unsafe"

	"github.com/taskcluster/taskcluster/v110/workers/generic-worker/host"
	"golang.org/x/sys/windows"
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

func setOwner(t *testing.T, path, user string) {
	t.Helper()
	if err := host.Run("icacls", path, "/setowner", user); err != nil {
		t.Fatalf("could not set owner of %q to %q: %v", path, user, err)
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

func readSD(t *testing.T, path string) *windows.SECURITY_DESCRIPTOR {
	t.Helper()
	sd, err := windows.GetNamedSecurityInfo(path, windows.SE_FILE_OBJECT, windows.OWNER_SECURITY_INFORMATION|windows.DACL_SECURITY_INFORMATION)
	if err != nil {
		t.Fatalf("could not read security descriptor of %q: %v", path, err)
	}
	return sd
}

func daclAllowsWorld(t *testing.T, sd *windows.SECURITY_DESCRIPTOR) bool {
	t.Helper()
	dacl, _, err := sd.DACL()
	if err != nil {
		if err == windows.ERROR_OBJECT_NOT_FOUND {
			return true
		}
		t.Fatalf("could not read DACL: %v", err)
	}
	if dacl == nil {
		return true
	}
	for i := uint16(0); i < dacl.AceCount; i++ {
		var ace *windows.ACCESS_ALLOWED_ACE
		if err := windows.GetAce(dacl, uint32(i), &ace); err != nil {
			t.Fatalf("GetAce: %v", err)
		}
		if ace.Header.AceType != windows.ACCESS_ALLOWED_ACE_TYPE {
			continue
		}
		sid := (*windows.SID)(unsafe.Pointer(&ace.SidStart))
		if sid.IsWellKnown(windows.WinBuiltinUsersSid) ||
			sid.IsWellKnown(windows.WinWorldSid) ||
			sid.IsWellKnown(windows.WinAuthenticatedUserSid) {
			return true
		}
	}
	return false
}

func requireWorldACE(t *testing.T, path string) {
	t.Helper()
	sd := readSD(t, path)
	if !daclAllowsWorld(t, sd) {
		t.Fatalf("%s did not inherit a Users/Everyone ACE: %s", path, sd.String())
	}
}

func assertProtectedNoWorld(t *testing.T, path string) {
	t.Helper()
	sd := readSD(t, path)
	sddl := sd.String()
	control, _, err := sd.Control()
	if err != nil {
		t.Fatalf("could not read control of %q: %v", path, err)
	}
	if control&windows.SE_DACL_PROTECTED == 0 {
		t.Errorf("%s DACL is not protected: %s", path, sddl)
	}
	if daclAllowsWorld(t, sd) {
		t.Errorf("%s DACL still grants Users/Everyone: %s", path, sddl)
	}
}

func assertGrantedToWorkerAndTaskUser(t *testing.T, path, taskUser string) {
	t.Helper()
	if !grantedTo(t, path, taskUser) {
		t.Errorf("task user was not granted %s", path)
	}
	if !grantedTo(t, path, "SYSTEM") {
		t.Errorf("SYSTEM was not granted %s", path)
	}
	if !grantedTo(t, path, "Administrators") {
		t.Errorf("Administrators was not granted %s", path)
	}
}

func mkdirCacheInheritingUsers(t *testing.T, parent string) (cache, nested string) {
	t.Helper()
	if err := os.MkdirAll(parent, 0o700); err != nil {
		t.Fatal(err)
	}
	// *S-1-5-32-545 = BUILTIN\Users
	if err := host.Run("icacls", parent, "/grant", "*S-1-5-32-545:(OI)(CI)(RX)"); err != nil {
		t.Fatal(err)
	}
	cache = filepath.Join(parent, "cache")
	nested = filepath.Join(cache, "nested", "file.txt")
	if err := os.MkdirAll(filepath.Dir(nested), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(nested, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{cache, filepath.Dir(nested), nested} {
		requireWorldACE(t, p)
	}
	return cache, nested
}

func assertSecuredPoolTree(t *testing.T, cache, nested, taskUser string) {
	t.Helper()
	for _, path := range []string{cache, filepath.Dir(nested), nested} {
		assertProtectedNoWorld(t, path)
		if grantedTo(t, path, taskUser) {
			t.Errorf("task user still has Full Control of %s", path)
		}
		if !grantedTo(t, path, "SYSTEM") {
			t.Errorf("SYSTEM was not granted %s", path)
		}
		if !grantedTo(t, path, "Administrators") {
			t.Errorf("Administrators was not granted %s", path)
		}
	}
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

	t.Run("refuses a hardlink belonging to someone else", func(t *testing.T) {
		cache := filepath.Join(base, "foreigncache")
		if err := os.MkdirAll(cache, 0o700); err != nil {
			t.Fatal(err)
		}
		setOwner(t, cache, taskUser)
		if err := os.Link(secretFile, filepath.Join(cache, "gift.txt")); err != nil {
			t.Fatal(err)
		}

		if err := grantFullControl(cache, taskUser, true); err == nil {
			t.Error("granted a hardlink owned by someone else")
		}
		untouched(t)
	})

	t.Run("takes a hardlink belonging to the previous owner", func(t *testing.T) {
		cache := filepath.Join(base, "ownlink")
		if err := os.MkdirAll(cache, 0o700); err != nil {
			t.Fatal(err)
		}
		file := filepath.Join(cache, "foo.txt")
		if err := os.WriteFile(file, []byte("bar"), 0o600); err != nil {
			t.Fatal(err)
		}
		if err := os.Link(file, filepath.Join(cache, "link.txt")); err != nil {
			t.Fatal(err)
		}
		setOwner(t, file, taskUser)
		setOwner(t, cache, taskUser)

		if err := grantFullControl(cache, taskUser, true); err != nil {
			t.Fatal(err)
		}
		if !grantedTo(t, file, taskUser) {
			t.Error("task user was not granted a hardlink it already owned")
		}
	})

	t.Run("takes every link of a file hardlinked inside the tree", func(t *testing.T) {
		cache := filepath.Join(base, "innerlinks")
		if err := os.MkdirAll(cache, 0o700); err != nil {
			t.Fatal(err)
		}
		file := filepath.Join(cache, "a")
		link1 := filepath.Join(cache, "b")
		link2 := filepath.Join(cache, "c")

		if err := os.WriteFile(file, []byte("Hi"), 0o600); err != nil {
			t.Fatal(err)
		}
		if err := os.Link(file, link1); err != nil {
			t.Fatal(err)
		}
		if err := os.Link(file, link2); err != nil {
			t.Fatal(err)
		}

		// *S-1-5-32-545 is BUILTIN\Users, just use that as the owner for testing
		setOwner(t, file, "*S-1-5-32-545")
		setOwner(t, cache, "*S-1-5-32-545")

		if err := grantFullControl(cache, taskUser, true); err != nil {
			t.Fatal(err)
		}
		for _, p := range []string{file, link1, link2} {
			if got := ownerOf(t, p); got != taskUser {
				t.Errorf("%q owner = %q, want %q", p, got, taskUser)
			}
			if !grantedTo(t, p, taskUser) {
				t.Errorf("task user was not granted %q", p)
			}
		}
	})

	t.Run("refuses to grant on a file something else can delete", func(t *testing.T) {
		cache := filepath.Join(base, "helddeletable")
		if err := os.MkdirAll(cache, 0o700); err != nil {
			t.Fatal(err)
		}
		file := filepath.Join(cache, "held.txt")
		if err := os.WriteFile(file, []byte("bar"), 0o600); err != nil {
			t.Fatal(err)
		}
		setOwner(t, cache, taskUser)

		p, err := windows.UTF16PtrFromString(file)
		if err != nil {
			t.Fatal(err)
		}
		h, err := windows.CreateFile(p, windows.DELETE|windows.SYNCHRONIZE, uint32(windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE), nil, windows.OPEN_EXISTING, 0, 0)
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = windows.CloseHandle(h) }()

		if err := grantFullControl(cache, taskUser, true); err == nil {
			t.Error("granted a file someone was holding with delete")
		}
	})

	t.Run("refuses any hardlink under a privileged root", func(t *testing.T) {
		cache := filepath.Join(base, "privilegedroot")
		if err := os.MkdirAll(cache, 0o700); err != nil {
			t.Fatal(err)
		}
		file := filepath.Join(cache, "foo.txt")
		if err := os.WriteFile(file, []byte("bar"), 0o600); err != nil {
			t.Fatal(err)
		}
		if err := os.Link(file, filepath.Join(cache, "link.txt")); err != nil {
			t.Fatal(err)
		}
		// *S-1-5-18 is NT AUTHORITY\SYSTEM
		setOwner(t, cache, "*S-1-5-18")

		if err := grantFullControl(cache, taskUser, true); err == nil {
			t.Error("granted a hardlink under a root owned by SYSTEM")
		}
	})

	t.Run("replaces inherited Users ACEs", func(t *testing.T) {
		cache, nested := mkdirCacheInheritingUsers(t, filepath.Join(base, "inherited-users"))
		if err := grantFullControl(cache, taskUser, true); err != nil {
			t.Fatal(err)
		}
		later := filepath.Join(cache, "later.txt")
		if err := os.WriteFile(later, []byte("y"), 0o600); err != nil {
			t.Fatal(err)
		}
		for _, path := range []string{cache, filepath.Dir(nested), nested} {
			assertProtectedNoWorld(t, path)
			assertGrantedToWorkerAndTaskUser(t, path, taskUser)
		}
		// later.txt is created after the grant, so it inherits the cache DACL
		// (ID ACEs) rather than getting a protected DACL of its own.
		sd := readSD(t, later)
		if daclAllowsWorld(t, sd) {
			t.Errorf("%s inherited Users/Everyone: %s", later, sd.String())
		}
		assertGrantedToWorkerAndTaskUser(t, later, taskUser)
	})
}

func TestSecureCachePoolEntry(t *testing.T) {
	setup(t)
	taskUser := taskContext.User.Name

	t.Run("strips the previous task user", func(t *testing.T) {
		cache, nested := mkdirCacheInheritingUsers(t, t.TempDir())
		if err := grantFullControl(cache, taskUser, true); err != nil {
			t.Fatal(err)
		}
		if !grantedTo(t, nested, taskUser) {
			t.Fatal("precondition: grant should give the task user the nested file")
		}
		if err := secureCachePoolEntry(cache); err != nil {
			t.Fatal(err)
		}
		assertSecuredPoolTree(t, cache, nested, taskUser)
	})

	t.Run("hardens a cache that was never granted", func(t *testing.T) {
		cache, nested := mkdirCacheInheritingUsers(t, t.TempDir())
		if err := secureCachePoolEntry(cache); err != nil {
			t.Fatal(err)
		}
		assertSecuredPoolTree(t, cache, nested, taskUser)
	})

	t.Run("remounts intra-cache hardlinks", func(t *testing.T) {
		cache, nested := mkdirCacheInheritingUsers(t, t.TempDir())
		link := filepath.Join(cache, "link.txt")
		if err := os.Link(nested, link); err != nil {
			t.Fatal(err)
		}
		setOwner(t, nested, taskUser)
		setOwner(t, cache, taskUser)
		if err := grantFullControl(cache, taskUser, true); err != nil {
			t.Fatal(err)
		}
		if err := secureCachePoolEntry(cache); err != nil {
			t.Fatal(err)
		}
		assertSecuredPoolTree(t, cache, nested, taskUser)
		if err := grantFullControl(cache, taskUser, true); err != nil {
			t.Fatal(err)
		}
		for _, p := range []string{nested, link} {
			if !grantedTo(t, p, taskUser) {
				t.Errorf("task user was not granted %s", p)
			}
		}
	})
}

func TestReturnCacheToPool(t *testing.T) {
	setup(t)
	taskUser := taskContext.User.Name
	parent := t.TempDir()
	cache, _ := mkdirCacheInheritingUsers(t, parent)
	if err := grantFullControl(cache, taskUser, true); err != nil {
		t.Fatal(err)
	}
	dest := filepath.Join(parent, "pool")
	if err := returnCacheToPool(cache, dest); err != nil {
		t.Fatal(err)
	}
	assertSecuredPoolTree(t, dest, filepath.Join(dest, "nested", "file.txt"), taskUser)
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
