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
