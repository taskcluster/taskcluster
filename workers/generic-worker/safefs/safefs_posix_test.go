//go:build darwin || linux || freebsd

package safefs

import (
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

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

func hardlink(t *testing.T, target, path string) string {
	t.Helper()
	if err := os.Link(target, path); err != nil {
		t.Fatal(err)
	}
	return path
}

func mkfifo(t *testing.T, path string) string {
	t.Helper()
	if err := unix.Mkfifo(path, 0o666); err != nil {
		t.Fatal(err)
	}
	return path
}

func openWithinTimeout(t *testing.T, open func() (*os.File, error)) (*os.File, error) {
	t.Helper()

	type result struct {
		f   *os.File
		err error
	}
	done := make(chan result, 1)
	go func() {
		f, err := open()
		done <- result{f, err}
	}()

	select {
	case r := <-done:
		return r.f, r.err
	case <-time.After(10 * time.Second):
		t.Fatal("blocked on a fifo")
		return nil, nil
	}
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

	t.Run("refuses a hardlinked leaf", func(t *testing.T) {
		base := t.TempDir()
		secret := write(t, filepath.Join(base, "secret.txt"), "secret")
		reserved := hardlink(t, secret, filepath.Join(base, "reserved"))

		if f, err := OpenExistingRDWR(reserved); err == nil {
			f.Close()
			t.Error("opened a hardlink")
		}
	})

	t.Run("refuses a fifo without blocking on it", func(t *testing.T) {
		fifo := mkfifo(t, filepath.Join(t.TempDir(), "reserved"))

		f, err := openWithinTimeout(t, func() (*os.File, error) { return OpenExistingRDWR(fifo) })
		if err == nil {
			f.Close()
			t.Error("opened a fifo")
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

	t.Run("does not block on a fifo in the prefix", func(t *testing.T) {
		base := t.TempDir()
		fifo := mkfifo(t, filepath.Join(base, "fifo"))

		f, err := openWithinTimeout(t, func() (*os.File, error) {
			return OpenExistingReadonly(filepath.Join(fifo, "leaf.txt"))
		})
		if err == nil {
			f.Close()
			t.Error("walked through a fifo")
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

	t.Run("does not open through a resolved symlink", func(t *testing.T) {
		base := t.TempDir()
		write(t, filepath.Join(base, "file.txt"), "ours")
		sub := mkdir(t, filepath.Join(base, "sub"))
		write(t, filepath.Join(sub, "file.txt"), "theirs")
		link := symlink(t, mkdir(t, filepath.Join(sub, "deep")), filepath.Join(base, "link"))

		f, err := OpenExistingReadonly(link + "/../file.txt")
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if b, err := io.ReadAll(f); err != nil || string(b) != "ours" {
			t.Errorf("read %q, %v", b, err)
		}
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

		err := Chown(base, os.Getuid(), os.Getgid(), true)
		if err == nil {
			t.Fatal("descended past the depth bound")
		}

		if !strings.Contains(err.Error(), "levels deep") {
			t.Errorf("lost the refusal: %v", err)
		}
		if strings.Contains(err.Error(), "further entries") {
			t.Errorf("counted one refusal more than once: %v", err)
		}
	})

	t.Run("refuses an empty path", func(t *testing.T) {
		if err := Chown("", os.Getuid(), os.Getgid(), false); err == nil {
			t.Error("chowned an empty path")
		}
	})

	t.Run("refuses a hardlink the tree owner did not own", func(t *testing.T) {
		if os.Getuid() != 0 {
			t.Skip("needs root to own the tree and the target as different users")
		}

		base := mkdir(t, filepath.Join(t.TempDir(), "tree"))
		if err := unix.Chown(base, 1, 1); err != nil {
			t.Fatal(err)
		}

		secret := write(t, filepath.Join(t.TempDir(), "secret.txt"), "secret")
		if err := unix.Chown(secret, 0, 0); err != nil {
			t.Fatal(err)
		}
		escape := hardlink(t, secret, filepath.Join(base, "escape"))

		err := Chown(base, 2, 2, true)
		if err == nil {
			t.Fatal("chowned a hardlink belonging to someone else")
		}

		if !strings.Contains(err.Error(), escape) {
			t.Errorf("failure doesn't mention %v: %v", escape, err)
		}

		var st unix.Stat_t
		if err := unix.Stat(secret, &st); err != nil {
			t.Fatalf("Failed to stat the secret back: %v", err)
		}

		if st.Uid != 0 {
			t.Errorf("file got reowned to %v", st.Uid)
		}
	})

	t.Run("refuses one whose other name is inside the tree too", func(t *testing.T) {
		if os.Getuid() != 0 {
			t.Skip("needs root to own the tree and its contents as different users")
		}

		// What a cache written by a d2g task could look like: the directory belongs
		// to the task user, the contents to whatever ran in the container
		base := mkdir(t, filepath.Join(t.TempDir(), "tree"))
		if err := unix.Chown(base, 1, 1); err != nil {
			t.Fatal(err)
		}

		first := write(t, filepath.Join(base, "a.txt"), "x")
		hardlink(t, first, filepath.Join(base, "b.txt"))

		err := Chown(base, 2, 2, true)
		if err == nil {
			t.Fatal("chowned a hardlink belonging to someone else")
		}

		if !strings.Contains(err.Error(), first) {
			t.Errorf("failure doesn't mention %v: %v", first, err)
		}

		var st unix.Stat_t
		if err := unix.Stat(first, &st); err != nil {
			t.Fatalf("failed to stat the hardlink back: %v", err)
		}

		if st.Uid != 0 {
			t.Errorf("file got reowned to %v", st.Uid)
		}
	})

	t.Run("chowns a hardlink whose names are all inside the tree", func(t *testing.T) {
		if os.Getuid() != 0 {
			t.Skip("needs root to change ownership")
		}

		base := mkdir(t, filepath.Join(t.TempDir(), "tree"))
		first := write(t, filepath.Join(base, "a.txt"), "x")
		sub := mkdir(t, filepath.Join(base, "sub"))
		second := hardlink(t, first, filepath.Join(sub, "b.txt"))

		for _, p := range []string{base, sub, first} {
			if err := unix.Chown(p, 1, 1); err != nil {
				t.Fatal(err)
			}
		}

		if err := Chown(base, 2, 2, true); err != nil {
			t.Fatalf("refused a hardlink the tree already owned: %v", err)
		}

		var st unix.Stat_t
		if err := unix.Stat(second, &st); err != nil {
			t.Fatalf("failed to stat the hardlink back: %v", err)
		}

		if st.Uid != 2 || st.Gid != 2 {
			t.Errorf("hardlink is owned by %v:%v", st.Uid, st.Gid)
		}
	})

	t.Run("chowns one whose other name is outside, if the owner matches", func(t *testing.T) {
		if os.Getuid() != 0 {
			t.Skip("needs root to change ownership")
		}

		base := mkdir(t, filepath.Join(t.TempDir(), "tree"))
		outside := write(t, filepath.Join(t.TempDir(), "theirs.txt"), "x")
		inside := hardlink(t, outside, filepath.Join(base, "linked"))

		for _, p := range []string{base, outside} {
			if err := unix.Chown(p, 1, 1); err != nil {
				t.Fatal(err)
			}
		}

		if err := Chown(base, 2, 2, true); err != nil {
			t.Fatalf("refused a hardlink the tree owner already owned: %v", err)
		}

		var st unix.Stat_t
		if err := unix.Stat(inside, &st); err != nil {
			t.Fatalf("failed to stat the hardlink back: %v", err)
		}

		if st.Uid != 2 {
			t.Errorf("hardlink is owned by %v", st.Uid)
		}
	})

	t.Run("refuses any hardlink under a root owned tree", func(t *testing.T) {
		if os.Getuid() != 0 {
			t.Skip("needs root to own the tree")
		}

		base := mkdir(t, filepath.Join(t.TempDir(), "tree"))
		first := write(t, filepath.Join(base, "a.txt"), "x")
		hardlink(t, first, filepath.Join(base, "b.txt"))

		err := Chown(base, 2, 2, true)
		if err == nil {
			t.Fatal("took a hardlink from a root owned tree")
		}

		if !strings.Contains(err.Error(), first) {
			t.Errorf("failure doesn't mention %v: %v", first, err)
		}

		var st unix.Stat_t
		if err := unix.Stat(first, &st); err != nil {
			t.Fatalf("failed to stat the hardlink back: %v", err)
		}

		if st.Uid != 0 {
			t.Errorf("file got reowned to %v", st.Uid)
		}
	})

	t.Run("leaves the kinds it cannot deal with alone", func(t *testing.T) {
		if os.Getuid() != 0 {
			t.Skip("needs root to change ownership")
		}

		base := mkdir(t, filepath.Join(t.TempDir(), "tree"))
		symlinkPath := symlink(t, "/etc/passwd", filepath.Join(base, "link"))
		file := write(t, filepath.Join(base, "file"), "x")

		fifo := filepath.Join(base, "fifo")
		if err := unix.Mkfifo(fifo, 0o644); err != nil {
			t.Fatal(err)
		}

		t.Chdir(base)
		sock, err := net.Listen("unix", "sock")
		if err != nil {
			t.Fatal(err)
		}
		defer sock.Close()

		if err := Chown(base, 1, 1, true); err != nil {
			t.Fatalf("choked on a kind it cannot deal with: %v", err)
		}

		var st unix.Stat_t
		if err := unix.Stat(file, &st); err != nil {
			t.Fatalf("failed to stat the regular file back: %v", err)
		}

		if st.Uid != 1 {
			t.Errorf("regular file is owned by %v", st.Uid)
		}

		for _, p := range []string{symlinkPath, fifo, filepath.Join(base, "sock")} {
			if err := unix.Lstat(p, &st); err != nil {
				t.Fatal(err)
			}
			if st.Uid == 1 {
				t.Errorf("chowned %v, which it shouldn't be able to hold a handle to (???)", filepath.Base(p))
			}
		}
	})

	t.Run("walks past a fifo in the tree", func(t *testing.T) {
		base := t.TempDir()
		if err := unix.Mkfifo(filepath.Join(base, "fifo"), 0o644); err != nil {
			t.Fatal(err)
		}

		if err := Chown(base, os.Getuid(), os.Getgid(), true); err != nil {
			t.Errorf("failed on a fifo: %v", err)
		}
	})

	t.Run("does not block on a fifo", func(t *testing.T) {
		base := t.TempDir()
		path := filepath.Join(base, "fifo")
		if err := unix.Mkfifo(path, 0o644); err != nil {
			t.Fatal(err)
		}

		dir, err := os.Open(base)
		if err != nil {
			t.Fatal(err)
		}
		defer dir.Close()

		c := &chowner{uid: os.Getuid(), gid: os.Getgid()}
		done := make(chan error, 1)
		go func() { done <- c.chownFile(int(dir.Fd()), "fifo", path) }()
		select {
		case err := <-done:
			if err == nil {
				t.Error("chowned a fifo")
			}
		case <-time.After(10 * time.Second):
			t.Fatal("blocked on a fifo")
		}
	})

	t.Run("refuses hardlink root target", func(t *testing.T) {
		base := t.TempDir()
		outside := write(t, filepath.Join(t.TempDir(), "secret.txt"), "secret")
		target := hardlink(t, outside, filepath.Join(base, "target"))

		if err := Chown(target, os.Getuid(), os.Getgid(), false); err == nil {
			t.Error("chowned a hardlink root")
		}
	})
}

func TestOpenExistingReadonly(t *testing.T) {
	t.Run("reads a file", func(t *testing.T) {
		file := write(t, filepath.Join(t.TempDir(), "file.txt"), "content")

		f, err := OpenExistingReadonly(file)
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if b, err := io.ReadAll(f); err != nil || string(b) != "content" {
			t.Errorf("read %q, %v", b, err)
		}
	})

	t.Run("refuses a symlinked leaf", func(t *testing.T) {
		base := t.TempDir()
		secret := write(t, filepath.Join(base, "secret.txt"), "secret")
		link := symlink(t, secret, filepath.Join(base, "link.txt"))

		if f, err := OpenExistingReadonly(link); err == nil {
			f.Close()
			t.Error("opened a symlink")
		}
	})

	t.Run("refuses a hardlinked leaf", func(t *testing.T) {
		base := t.TempDir()
		secret := write(t, filepath.Join(base, "secret.txt"), "secret")
		reserved := hardlink(t, secret, filepath.Join(base, "reserved.log"))

		if f, err := OpenExistingReadonly(reserved); err == nil {
			f.Close()
			t.Error("opened a hardlink")
		}
	})

	t.Run("refuses a fifo without blocking on it", func(t *testing.T) {
		fifo := mkfifo(t, filepath.Join(t.TempDir(), "reserved.log"))

		f, err := openWithinTimeout(t, func() (*os.File, error) { return OpenExistingReadonly(fifo) })
		if err == nil {
			f.Close()
			t.Error("opened a fifo")
		}
	})

	t.Run("refuses a socket", func(t *testing.T) {
		base := t.TempDir()
		t.Chdir(base)
		sock, err := net.Listen("unix", "reserved.log")
		if err != nil {
			t.Fatal(err)
		}
		defer sock.Close()

		if f, err := OpenExistingReadonly(filepath.Join(base, "reserved.log")); err == nil {
			f.Close()
			t.Error("opened a socket")
		}
	})
}

func TestCreate(t *testing.T) {
	t.Run("writes a file", func(t *testing.T) {
		file := filepath.Join(t.TempDir(), "file.txt")

		f, err := Create(file, 0o644)
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
		dst := symlink(t, secret, filepath.Join(base, "dst"))

		if f, err := Create(dst, 0o644); err == nil {
			f.Close()
			t.Error("created through a symlink")
		}
		if b, _ := os.ReadFile(secret); string(b) != "secret" {
			t.Errorf("secret = %q", b)
		}
	})

	t.Run("refuses a symlinked prefix", func(t *testing.T) {
		base := untrustedTempDir(t)
		secret := mkdir(t, filepath.Join(base, "secret"))
		stage := symlink(t, secret, filepath.Join(base, "stage"))

		if f, err := Create(filepath.Join(stage, "planted.txt"), 0o644); err == nil {
			f.Close()
			t.Error("walked through a symlink")
		}
		if _, err := os.Lstat(filepath.Join(secret, "planted.txt")); err == nil {
			t.Error("planted inside the secret")
		}
	})

	t.Run("refuses a hardlinked leaf without truncating it", func(t *testing.T) {
		base := t.TempDir()
		victim := write(t, filepath.Join(base, "victim"), "important")
		dst := hardlink(t, victim, filepath.Join(base, "dst"))

		if f, err := Create(dst, 0o644); err == nil {
			f.Close()
			t.Error("created through a hardlink")
		}
		// O_TRUNC would have emptied it before we ever got to refuse
		if b, _ := os.ReadFile(victim); string(b) != "important" {
			t.Errorf("victim was clobbered: %q", b)
		}
	})

	t.Run("hands out a write only handle", func(t *testing.T) {
		f, err := Create(filepath.Join(t.TempDir(), "file.txt"), 0o644)
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()

		if _, err := f.Write([]byte("baguette")); err != nil {
			t.Fatal(err)
		}
		if _, err := f.Seek(0, io.SeekStart); err != nil {
			t.Fatal(err)
		}
		if _, err := io.ReadAll(f); err == nil {
			t.Error("read from a handle that should only be writable")
		}
	})
}

func TestCreateRW(t *testing.T) {
	t.Run("hands out a readable handle", func(t *testing.T) {
		f, err := CreateRW(filepath.Join(t.TempDir(), "file.txt"), 0o644)
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()

		if _, err := f.Write([]byte("baguette")); err != nil {
			t.Fatal(err)
		}
		if _, err := f.Seek(0, io.SeekStart); err != nil {
			t.Fatal(err)
		}
		b, err := io.ReadAll(f)
		if err != nil || string(b) != "baguette" {
			t.Errorf("read back = %q, %v", b, err)
		}
	})

	t.Run("truncates an existing file before it can be read", func(t *testing.T) {
		file := write(t, filepath.Join(t.TempDir(), "file.txt"), "secret")

		f, err := CreateRW(file, 0o644)
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()

		b, err := io.ReadAll(f)
		if err != nil || len(b) != 0 {
			t.Errorf("read back = %q, %v", b, err)
		}
	})
}

func TestRemove(t *testing.T) {
	t.Run("removes a file", func(t *testing.T) {
		file := write(t, filepath.Join(t.TempDir(), "file.txt"), "")

		if err := Remove(file); err != nil {
			t.Fatal(err)
		}
		if _, err := os.Lstat(file); !os.IsNotExist(err) {
			t.Errorf("still there, %v", err)
		}
	})

	t.Run("removes an empty directory", func(t *testing.T) {
		dir := mkdir(t, filepath.Join(t.TempDir(), "dir"))

		if err := Remove(dir); err != nil {
			t.Fatal(err)
		}
		if _, err := os.Lstat(dir); !os.IsNotExist(err) {
			t.Errorf("still there, %v", err)
		}
	})

	t.Run("refuses a non empty directory", func(t *testing.T) {
		dir := mkdir(t, filepath.Join(t.TempDir(), "dir"))
		write(t, filepath.Join(dir, "file.txt"), "")

		if err := Remove(dir); err == nil {
			t.Error("removed a non empty directory")
		}
	})

	t.Run("takes the link not its target", func(t *testing.T) {
		base := t.TempDir()
		secret := write(t, filepath.Join(base, "secret.txt"), "secret")
		link := symlink(t, secret, filepath.Join(base, "link"))

		if err := Remove(link); err != nil {
			t.Fatal(err)
		}
		if _, err := os.Lstat(link); !os.IsNotExist(err) {
			t.Errorf("link still there, %v", err)
		}
		if b, _ := os.ReadFile(secret); string(b) != "secret" {
			t.Errorf("secret = %q", b)
		}
	})

	t.Run("refuses a symlinked prefix", func(t *testing.T) {
		base := untrustedTempDir(t)
		secret := write(t, filepath.Join(mkdir(t, filepath.Join(base, "secret")), "leaf.txt"), "secret")
		stage := symlink(t, filepath.Join(base, "secret"), filepath.Join(base, "stage"))

		if err := Remove(filepath.Join(stage, "leaf.txt")); err == nil {
			t.Error("walked through a symlink")
		}
		if _, err := os.Lstat(secret); err != nil {
			t.Errorf("secret removed, %v", err)
		}
	})
}

func TestIsExistingDir(t *testing.T) {
	base := untrustedTempDir(t)
	dir := mkdir(t, filepath.Join(base, "dir"))
	mkdir(t, filepath.Join(dir, "sub"))
	file := write(t, filepath.Join(base, "file.txt"), "")
	link := symlink(t, dir, filepath.Join(base, "link"))
	fifo := mkfifo(t, filepath.Join(base, "fifo"))

	for _, tc := range []struct {
		path string
		want bool
	}{
		{dir, true},
		{file, false},
		{fifo, false},
		{link, false},
		{filepath.Join(link, "sub"), false},
		{filepath.Join(base, "missing"), false},
		{"", false},
	} {
		if got := IsExistingDir(tc.path); got != tc.want {
			t.Errorf("IsExistingDir(%q) = %v", tc.path, got)
		}
	}
}

func TestChownMayTake(t *testing.T) {
	const taskUser, nextUser, otherUser = 1000, 1001, 1002

	for _, tc := range []struct {
		name  string
		from  uint32
		to    int
		nlink uint64
		uid   uint32
		want  bool
	}{
		{"single link, tree owner", taskUser, nextUser, 1, taskUser, true},
		{"single link, anyone else", taskUser, nextUser, 1, otherUser, true},
		{"single link, root owned file", taskUser, nextUser, 1, 0, true},
		{"single link under a root owned tree", 0, nextUser, 1, 0, true},
		{"hardlink the tree already owned", taskUser, nextUser, 2, taskUser, true},
		{"hardlink the new owner already owns", taskUser, nextUser, 2, nextUser, true},
		{"hardlink the new owner already owns under a root owned tree", 0, nextUser, 2, nextUser, true},
		{"hardlink owned by another user", taskUser, nextUser, 2, otherUser, false},
		{"hardlink owned by root", taskUser, nextUser, 2, 0, false},
		{"hardlink owned by root when handing over to root", taskUser, 0, 2, 0, false},
		{"hardlink under a root owned tree", 0, nextUser, 2, 0, false},
		{"hardlink under a root owned tree, other owner", 0, nextUser, 2, otherUser, false},
		{"many links, tree owner", taskUser, nextUser, 9, taskUser, true},
		{"many links, another user", taskUser, nextUser, 9, otherUser, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c := &chowner{uid: tc.to, from: tc.from}
			if got := c.mayTake(tc.nlink, tc.uid); got != tc.want {
				t.Errorf("mayTake(nlink=%v, uid=%v) with from=%v to=%v = %v, wanted %v", tc.nlink, tc.uid, tc.from, tc.to, got, tc.want)
			}
		})
	}
}

func TestChownRefuse(t *testing.T) {
	c := &chowner{}
	const over = 7
	for i := range maxChownErrors + over {
		c.refuse(fmt.Errorf("refusal %v", i))
	}

	if len(c.errs) > maxChownErrors {
		t.Errorf("kept %v errors, wanted at most %v", len(c.errs), maxChownErrors)
	}
	dropped := maxChownErrors + over - len(c.errs)
	if reported := c.refused - maxChownErrors; reported != dropped {
		t.Errorf("dropped %v errors but reports %v", dropped, reported)
	}
}

func TestRefuseIfIrregular(t *testing.T) {
	openBoth := func(t *testing.T, dir, name string) (int, int) {
		t.Helper()
		dirfd, err := unix.Open(dir, dirFlags, 0)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { unix.Close(dirfd) })
		fd, err := unix.Openat(dirfd, name, unix.O_RDWR|leafFlags, 0)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { unix.Close(fd) })
		return dirfd, fd
	}

	t.Run("accepts a plain file", func(t *testing.T) {
		base := t.TempDir()
		path := write(t, filepath.Join(base, "file.txt"), "x")
		dirfd, fd := openBoth(t, base, "file.txt")

		if err := refuseIfIrregular(dirfd, "file.txt", fd, path); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("refuses a link dropped after the open", func(t *testing.T) {
		base := t.TempDir()
		write(t, filepath.Join(base, "target"), "important")
		link := hardlink(t, filepath.Join(base, "target"), filepath.Join(base, "link"))
		dirfd, fd := openBoth(t, base, "link")

		if err := os.Remove(link); err != nil {
			t.Fatal(err)
		}
		if err := refuseIfIrregular(dirfd, "link", fd, link); err == nil {
			t.Error("accepted a link whose own name was dropped")
		}
	})

	t.Run("refuses a link replaced after the open", func(t *testing.T) {
		base := t.TempDir()
		write(t, filepath.Join(base, "target"), "important")
		link := hardlink(t, filepath.Join(base, "target"), filepath.Join(base, "link"))
		dirfd, fd := openBoth(t, base, "link")

		if err := os.Remove(link); err != nil {
			t.Fatal(err)
		}
		write(t, link, "innocent")
		if err := refuseIfIrregular(dirfd, "link", fd, link); err == nil {
			t.Error("accepted a name pointing at a differentfile")
		}
	})

	t.Run("refuses a hardlink", func(t *testing.T) {
		base := t.TempDir()
		target := write(t, filepath.Join(base, "target"), "important")
		link := hardlink(t, target, filepath.Join(base, "link"))
		dirfd, fd := openBoth(t, base, "link")

		if err := refuseIfIrregular(dirfd, "link", fd, link); err == nil {
			t.Error("accepted a hardlink")
		}
	})
}
