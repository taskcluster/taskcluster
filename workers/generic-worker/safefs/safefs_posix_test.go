//go:build darwin || linux || freebsd

package safefs

import (
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"golang.org/x/sys/unix"
)

func write(t *testing.T, path, content string) string {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func symlink(t *testing.T, target, path string) string {
	t.Helper()
	if err := os.Symlink(target, path); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestOpenExistingRDWR(t *testing.T) {
	t.Run("writes through the handle", func(t *testing.T) {
		file := write(t, filepath.Join(t.TempDir(), "file.txt"), "")

		f, err := OpenExistingRDWR(file)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.Write([]byte("content")); err != nil {
			t.Fatal(err)
		}
		if err := f.Close(); err != nil {
			t.Fatal(err)
		}
		if b, err := os.ReadFile(file); err != nil || string(b) != "content" {
			t.Errorf("file = %q, %v", b, err)
		}
	})

	t.Run("refuses a symlinked leaf", func(t *testing.T) {
		base := t.TempDir()
		secret := write(t, filepath.Join(base, "secret.txt"), "secret")
		link := symlink(t, secret, filepath.Join(base, "link.txt"))

		f, err := OpenExistingRDWR(link)
		if err == nil {
			_, _ = f.WriteString("pwned")
			f.Close()
			t.Error("opened a symlink")
		}
		if b, _ := os.ReadFile(secret); string(b) != "secret" {
			t.Errorf("secret = %q", b)
		}
	})

	t.Run("refuses a missing file", func(t *testing.T) {
		if f, err := OpenExistingRDWR(filepath.Join(t.TempDir(), "missing.txt")); err == nil {
			f.Close()
			t.Error("opened a missing file")
		}
	})
}

func mkdir(t *testing.T, path string) string {
	t.Helper()
	if err := os.MkdirAll(path, 0o700); err != nil {
		t.Fatal(err)
	}
	return path
}

func untrustedTempDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.Chmod(dir, 0o777); err != nil {
		t.Fatal(err)
	}
	return dir
}

func TestPathWalk(t *testing.T) {
	t.Run("refuses a symlinked prefix", func(t *testing.T) {
		base := untrustedTempDir(t)
		secret := write(t, filepath.Join(mkdir(t, filepath.Join(base, "secret", "leaf")), "secret.txt"), "secret")
		stage := symlink(t, filepath.Join(base, "secret"), filepath.Join(base, "stage"))

		f, err := OpenExistingRDWR(filepath.Join(stage, "leaf", "secret.txt"))
		if err == nil {
			_, _ = f.WriteString("pwned")
			f.Close()
			t.Error("walked through a symlink")
		}
		if b, _ := os.ReadFile(secret); string(b) != "secret" {
			t.Errorf("secret = %q", b)
		}
	})

	t.Run("follows a link only root could have planted", func(t *testing.T) {
		if fi, err := os.Lstat("/tmp"); err != nil || fi.Mode()&os.ModeSymlink == 0 {
			t.Skip("/tmp is not a symlink here")
		}
		path := filepath.Join("/tmp", "safefs-"+strconv.Itoa(os.Getpid()))
		_ = os.Remove(path)
		file := write(t, path, "content")
		t.Cleanup(func() { os.Remove(file) })

		f, err := OpenExistingRDWR(file)
		if err != nil {
			t.Fatal(err)
		}
		f.Close()
	})

	t.Run("refuses a link in a world writable directory", func(t *testing.T) {
		var st unix.Stat_t
		if err := unix.Stat("/tmp", &st); err != nil || st.Uid != 0 || st.Mode&(unix.S_IWGRP|unix.S_IWOTH) == 0 {
			t.Skip("/tmp is not root owned and world writable here")
		}
		path := filepath.Join("/tmp", "safefs-link-"+strconv.Itoa(os.Getpid()))
		_ = os.Remove(path)
		link := symlink(t, "/etc", path)
		t.Cleanup(func() { os.Remove(link) })

		if f, err := OpenExistingRDWR(filepath.Join(link, "hosts")); err == nil {
			f.Close()
			t.Error("walked through a link anyone could plant")
		}
	})

	t.Run("resolves a relative path", func(t *testing.T) {
		base := t.TempDir()
		write(t, filepath.Join(base, "file.txt"), "")
		t.Chdir(base)

		f, err := OpenExistingRDWR("file.txt")
		if err != nil {
			t.Fatal(err)
		}
		f.Close()
	})

	t.Run("refuses bad paths", func(t *testing.T) {
		base := t.TempDir()
		write(t, filepath.Join(base, "file.txt"), "")

		for _, path := range []string{"", "/"} {
			if f, err := OpenExistingRDWR(path); err == nil {
				f.Close()
				t.Errorf("opened %q", path)
			}
		}
	})
}

func TestRename(t *testing.T) {
	t.Run("moves", func(t *testing.T) {
		base := t.TempDir()
		src := write(t, filepath.Join(base, "src"), "data")
		dst := filepath.Join(base, "dst")

		if err := Rename(src, dst); err != nil {
			t.Fatal(err)
		}
		if b, err := os.ReadFile(dst); err != nil || string(b) != "data" {
			t.Errorf("dst = %q, %v", b, err)
		}
		if _, err := os.Lstat(src); !os.IsNotExist(err) {
			t.Errorf("src still there, %v", err)
		}
	})

	t.Run("refuses a symlinked source", func(t *testing.T) {
		base := t.TempDir()
		secret := write(t, filepath.Join(base, "secret.txt"), "secret")
		src := symlink(t, secret, filepath.Join(base, "src"))

		if err := Rename(src, filepath.Join(base, "dst")); err == nil {
			t.Error("renamed a symlink")
		}
		if _, err := os.Lstat(secret); err != nil {
			t.Errorf("secret moved, %v", err)
		}
	})

	t.Run("replaces a symlinked destination", func(t *testing.T) {
		base := t.TempDir()
		secret := write(t, filepath.Join(base, "secret.txt"), "secret")
		src := write(t, filepath.Join(base, "src"), "data")
		dst := symlink(t, secret, filepath.Join(base, "dst"))

		if err := Rename(src, dst); err != nil {
			t.Fatal(err)
		}
		if b, _ := os.ReadFile(secret); string(b) != "secret" {
			t.Errorf("secret = %q", b)
		}
		if b, err := os.ReadFile(dst); err != nil || string(b) != "data" {
			t.Errorf("dst = %q, %v", b, err)
		}
	})

	t.Run("refuses a symlinked source prefix", func(t *testing.T) {
		base := untrustedTempDir(t)
		secret := write(t, filepath.Join(mkdir(t, filepath.Join(base, "secret")), "loot"), "secret")
		stage := symlink(t, filepath.Join(base, "secret"), filepath.Join(base, "stage"))

		if err := Rename(filepath.Join(stage, "loot"), filepath.Join(base, "stolen")); err == nil {
			t.Error("walked through a symlink")
		}
		if _, err := os.Lstat(secret); err != nil {
			t.Errorf("secret moved, %v", err)
		}
	})

	t.Run("refuses a symlinked destination prefix", func(t *testing.T) {
		base := untrustedTempDir(t)
		secret := mkdir(t, filepath.Join(base, "secret"))
		stage := symlink(t, secret, filepath.Join(base, "stage"))
		src := write(t, filepath.Join(base, "src"), "data")

		if err := Rename(src, filepath.Join(stage, "planted.txt")); err == nil {
			t.Error("walked through a symlink")
		}
		if _, err := os.Lstat(filepath.Join(secret, "planted.txt")); err == nil {
			t.Error("planted inside the secret")
		}
	})

	t.Run("refuses bad paths", func(t *testing.T) {
		dst := filepath.Join(t.TempDir(), "moved")
		for _, src := range []string{"", "/"} {
			if err := Rename(src, dst); err == nil {
				t.Errorf("renamed %q", src)
			}
		}
		if _, err := os.Lstat(dst); !os.IsNotExist(err) {
			t.Errorf("dst exists, %v", err)
		}
	})
}

func TestChown(t *testing.T) {
	t.Run("walks the tree", func(t *testing.T) {
		if os.Getuid() != 0 {
			t.Skip("needs root to change ownership")
		}
		base := t.TempDir()
		deep := write(t, filepath.Join(mkdir(t, filepath.Join(base, "dir", "sub")), "file.txt"), "")
		outside := write(t, filepath.Join(t.TempDir(), "outside.txt"), "")
		symlink(t, outside, filepath.Join(base, "dir", "link"))

		if err := Chown(base, 1, 1, true); err != nil {
			t.Fatal(err)
		}

		var st unix.Stat_t
		if err := unix.Stat(deep, &st); err != nil || st.Uid != 1 || st.Gid != 1 {
			t.Errorf("nested file is %v:%v, %v", st.Uid, st.Gid, err)
		}
		if err := unix.Stat(outside, &st); err != nil || st.Uid == 1 {
			t.Errorf("followed the link, target is %v", st.Uid)
		}
	})

	t.Run("does not descend into links", func(t *testing.T) {
		if os.Getuid() == 0 {
			t.Skip("as root the chown would succeed through the link")
		}
		base := t.TempDir()
		symlink(t, "/etc", filepath.Join(base, "link"))

		if err := Chown(base, os.Getuid(), os.Getgid(), true); err != nil {
			t.Fatalf("followed the link, %v", err)
		}
	})

	t.Run("refuses a symlinked target", func(t *testing.T) {
		base := t.TempDir()
		link := symlink(t, mkdir(t, filepath.Join(base, "target")), filepath.Join(base, "link"))

		if err := Chown(link, os.Getuid(), os.Getgid(), true); err == nil {
			t.Error("chowned a symlink")
		}
	})

	t.Run("refuses a symlinked prefix", func(t *testing.T) {
		base := untrustedTempDir(t)
		mkdir(t, filepath.Join(base, "secret", "leaf"))
		stage := symlink(t, filepath.Join(base, "secret"), filepath.Join(base, "stage"))

		if err := Chown(filepath.Join(stage, "leaf"), os.Getuid(), os.Getgid(), true); err == nil {
			t.Error("walked through a symlink")
		}
	})

	t.Run("stops at max depth", func(t *testing.T) {
		defer func(depth int) { maxChownDepth = depth }(maxChownDepth)
		maxChownDepth = 4

		base := t.TempDir()
		deep := base
		for range maxChownDepth + 2 {
			deep = filepath.Join(deep, "d")
		}
		mkdir(t, deep)

		if err := Chown(base, os.Getuid(), os.Getgid(), true); err == nil {
			t.Error("descended past the depth bound")
		}
	})

	t.Run("refuses an empty path", func(t *testing.T) {
		if err := Chown("", os.Getuid(), os.Getgid(), false); err == nil {
			t.Error("chowned an empty path")
		}
	})
}
