package safefs

import (
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"golang.org/x/sys/windows"
)

func mkjunction(t *testing.T, link, target string) {
	t.Helper()
	if out, err := exec.Command("cmd", "/c", "mklink", "/J", link, target).CombinedOutput(); err != nil {
		t.Fatalf("mklink %q -> %q: %v: %s", link, target, err, out)
	}
}

func write(t *testing.T, path, content string) string {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
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

func mkdir(t *testing.T, path string) string {
	t.Helper()
	if err := os.MkdirAll(path, 0o700); err != nil {
		t.Fatal(err)
	}
	return path
}

func mksecret(t *testing.T, base string) (secret, secretFile string) {
	t.Helper()
	secret = filepath.Join(base, "secret")
	secretFile = write(t, filepath.Join(mkdir(t, filepath.Join(secret, "leaf")), "secret.txt"), "secret")
	return secret, secretFile
}

func TestOpenPath(t *testing.T) {
	t.Run("opens a real path", func(t *testing.T) {
		file := write(t, filepath.Join(mkdir(t, filepath.Join(t.TempDir(), "sub")), "file.txt"), "")

		h, err := OpenPath(file, SecAccess)
		if err != nil {
			t.Fatal(err)
		}
		_ = windows.CloseHandle(h)
	})

	t.Run("refuses a junctioned leaf", func(t *testing.T) {
		base := t.TempDir()
		secret, _ := mksecret(t, base)
		link := filepath.Join(base, "link")
		mkjunction(t, link, secret)

		if h, err := OpenPath(link, SecAccess); err == nil {
			_ = windows.CloseHandle(h)
			t.Error("opened a junction")
		}
	})

	t.Run("refuses a junctioned prefix", func(t *testing.T) {
		base := t.TempDir()
		secret, _ := mksecret(t, base)
		stage := filepath.Join(base, "stage")
		mkjunction(t, stage, secret)

		if h, err := OpenPath(filepath.Join(stage, "leaf", "secret.txt"), SecAccess); err == nil {
			_ = windows.CloseHandle(h)
			t.Error("walked through a junction")
		}
	})

	t.Run("cleans a path containing ..", func(t *testing.T) {
		base := t.TempDir()
		write(t, filepath.Join(base, "file.txt"), "")

		h, err := OpenPath(base+`\sub\..\file.txt`, SecAccess)
		if err != nil {
			t.Fatal(err)
		}
		_ = windows.CloseHandle(h)
	})

	t.Run("does not clean through a junction", func(t *testing.T) {
		base := t.TempDir()
		write(t, filepath.Join(base, "file.txt"), "ours")
		sub := mkdir(t, filepath.Join(base, "sub"))
		write(t, filepath.Join(sub, "file.txt"), "theirs")
		link := filepath.Join(base, "link")
		mkjunction(t, link, mkdir(t, filepath.Join(sub, "deep")))

		f, err := OpenExistingReadonly(link + `\..\file.txt`)
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if b, err := io.ReadAll(f); err != nil || string(b) != "ours" {
			t.Errorf("read %q, %v", b, err)
		}
	})
}

func TestRename(t *testing.T) {
	t.Run("moves within a volume", func(t *testing.T) {
		base := t.TempDir()
		src := write(t, filepath.Join(base, "src"), "data")
		dst := filepath.Join(base, "dst")

		if err := Rename(src, dst); err != nil {
			t.Fatal(err)
		}
		if b, err := os.ReadFile(dst); err != nil || string(b) != "data" {
			t.Errorf("dst = %q, %v", b, err)
		}
		if _, err := os.Stat(src); !os.IsNotExist(err) {
			t.Errorf("src still there, %v", err)
		}
	})

	t.Run("refuses a junctioned destination prefix", func(t *testing.T) {
		base := t.TempDir()
		secret, _ := mksecret(t, base)
		stage := filepath.Join(base, "stage")
		mkjunction(t, stage, secret)
		src := write(t, filepath.Join(base, "src"), "data")

		if err := Rename(src, filepath.Join(stage, "leaf", "planted.txt")); err == nil {
			t.Error("walked through a junction")
		}
		if _, err := os.Stat(filepath.Join(secret, "leaf", "planted.txt")); err == nil {
			t.Error("planted inside the secret")
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

	t.Run("refuses a junctioned prefix", func(t *testing.T) {
		base := t.TempDir()
		secret, secretFile := mksecret(t, base)
		stage := filepath.Join(base, "stage")
		mkjunction(t, stage, secret)

		if err := Remove(filepath.Join(stage, "leaf", "secret.txt")); err == nil {
			t.Error("walked through a junction")
		}
		if _, err := os.Lstat(secretFile); err != nil {
			t.Errorf("secret removed, %v", err)
		}
	})
}

func TestIsExistingDir(t *testing.T) {
	base := t.TempDir()
	dir := mkdir(t, filepath.Join(base, "dir"))
	mkdir(t, filepath.Join(dir, "sub"))
	file := write(t, filepath.Join(base, "file.txt"), "")
	link := filepath.Join(base, "link")
	mkjunction(t, link, dir)

	for _, tc := range []struct {
		path string
		want bool
	}{
		{dir, true},
		{file, false},
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

func TestCreate(t *testing.T) {
	t.Run("creates a new file", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "new.txt")

		f, err := Create(path, 0o644)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.WriteString("baguette"); err != nil {
			f.Close()
			t.Fatal(err)
		}
		if err := f.Close(); err != nil {
			t.Fatal(err)
		}
		if b, err := os.ReadFile(path); err != nil || string(b) != "baguette" {
			t.Errorf("content = %q, %v", b, err)
		}
	})

	t.Run("truncates an existing file", func(t *testing.T) {
		path := write(t, filepath.Join(t.TempDir(), "existing.txt"), "This is a very long file with lots of stuff in it")

		f, err := Create(path, 0o644)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.WriteString("short"); err != nil {
			f.Close()
			t.Fatal(err)
		}
		if err := f.Close(); err != nil {
			t.Fatal(err)
		}
		if b, err := os.ReadFile(path); err != nil || string(b) != "short" {
			t.Errorf("content = %q, %v", b, err)
		}
	})

	t.Run("refuses a junctioned prefix", func(t *testing.T) {
		base := t.TempDir()
		secret := mkdir(t, filepath.Join(base, "secret"))
		stage := filepath.Join(base, "stage")
		mkjunction(t, stage, secret)

		if f, err := Create(filepath.Join(stage, "target.txt"), 0o644); err == nil {
			f.Close()
			t.Error("walked through a junction")
		}
		if _, err := os.Lstat(filepath.Join(secret, "target.txt")); err == nil {
			t.Error("target written inside secret")
		}
	})

	t.Run("refuses a hardlinked leaf without truncating it", func(t *testing.T) {
		base := t.TempDir()
		target := write(t, filepath.Join(base, "target"), "important")
		dst := hardlink(t, target, filepath.Join(base, "dst"))

		if f, err := Create(dst, 0o644); err == nil {
			f.Close()
			t.Error("created through a hardlink")
		}
		if b, _ := os.ReadFile(target); string(b) != "important" {
			t.Errorf("target was clobbered: %q", b)
		}
	})

	t.Run("hands out a write only handle", func(t *testing.T) {
		f, err := Create(filepath.Join(t.TempDir(), "new.txt"), 0o644)
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()

		if _, err := f.WriteString("baguette"); err != nil {
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
		f, err := CreateRW(filepath.Join(t.TempDir(), "new.txt"), 0o644)
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()

		if _, err := f.WriteString("baguette"); err != nil {
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
		path := write(t, filepath.Join(t.TempDir(), "existing.txt"), "secret")

		f, err := CreateRW(path, 0o644)
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

func TestOpenExistingRDWR(t *testing.T) {
	t.Run("refuses a hardlinked leaf", func(t *testing.T) {
		base := t.TempDir()
		secret := write(t, filepath.Join(base, "secret.txt"), "secret")
		reserved := hardlink(t, secret, filepath.Join(base, "reserved"))

		if f, err := OpenExistingRDWR(reserved); err == nil {
			f.Close()
			t.Error("opened a hardlink")
		}
	})

	t.Run("refuses a directory", func(t *testing.T) {
		dir := mkdir(t, filepath.Join(t.TempDir(), "dir"))

		if f, err := OpenExistingRDWR(dir); err == nil {
			f.Close()
			t.Error("opened a directory???")
		}
	})
}

func TestOpenExistingReadonly(t *testing.T) {
	t.Run("refuses a hardlinked leaf", func(t *testing.T) {
		base := t.TempDir()
		secret := write(t, filepath.Join(base, "secret.txt"), "secret")
		reserved := hardlink(t, secret, filepath.Join(base, "reserved"))

		if f, err := OpenExistingReadonly(reserved); err == nil {
			f.Close()
			t.Error("opened a hardlink")
		}
	})
}

func TestCreateOrTruncateChild(t *testing.T) {
	openDir := func(t *testing.T, dir string) windows.Handle {
		t.Helper()
		h, err := OpenPath(dir, traverseAccess|windows.FILE_WRITE_DATA|windows.FILE_APPEND_DATA)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = windows.CloseHandle(h) })
		return h
	}

	t.Run("creates a new file", func(t *testing.T) {
		base := t.TempDir()
		file := filepath.Join(base, "new.txt")

		h, err := CreateOrTruncateChild(openDir(t, base), "new.txt", base, windows.GENERIC_WRITE|windows.SYNCHRONIZE)
		if err != nil {
			t.Fatal(err)
		}
		f := os.NewFile(uintptr(h), file)
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

	t.Run("refuses a directory", func(t *testing.T) {
		base := t.TempDir()
		mkdir(t, filepath.Join(base, "dir"))

		if h, err := CreateOrTruncateChild(openDir(t, base), "dir", base, windows.GENERIC_WRITE|windows.SYNCHRONIZE); err == nil {
			_ = windows.CloseHandle(h)
			t.Error("opened a directory")
		}
	})

	t.Run("refuses a junction", func(t *testing.T) {
		base := t.TempDir()
		secret, _ := mksecret(t, base)
		mkjunction(t, filepath.Join(base, "link"), secret)

		if h, err := CreateOrTruncateChild(openDir(t, base), "link", base, windows.GENERIC_WRITE|windows.SYNCHRONIZE); err == nil {
			_ = windows.CloseHandle(h)
			t.Error("opened a junction")
		}
	})

	t.Run("empties an existing file", func(t *testing.T) {
		base := t.TempDir()
		file := write(t, filepath.Join(base, "f.txt"), "This was a very long file with so much info")

		h, err := CreateOrTruncateChild(openDir(t, base), "f.txt", base, windows.GENERIC_WRITE|windows.SYNCHRONIZE)
		if err != nil {
			t.Fatal(err)
		}
		f := os.NewFile(uintptr(h), file)
		if _, err := f.Write([]byte("new")); err != nil {
			t.Fatal(err)
		}
		if err := f.Close(); err != nil {
			t.Fatal(err)
		}
		if b, err := os.ReadFile(file); err != nil || string(b) != "new" {
			t.Errorf("file = %q, %v", b, err)
		}
	})

	t.Run("refuses a hardlinked leaf without truncating it", func(t *testing.T) {
		base := t.TempDir()
		target := write(t, filepath.Join(base, "target"), "baguette")
		hardlink(t, target, filepath.Join(base, "dst"))

		if h, err := CreateOrTruncateChild(openDir(t, base), "dst", base, windows.GENERIC_WRITE|windows.SYNCHRONIZE); err == nil {
			_ = windows.CloseHandle(h)
			t.Error("created through a hardlink")
		}
		if b, _ := os.ReadFile(target); string(b) != "baguette" {
			t.Errorf("target was eaten: %q", b)
		}
	})
}

func TestLeafOpensPinsTheName(t *testing.T) {
	t.Run("refuses a delete while the handle is held", func(t *testing.T) {
		base := t.TempDir()
		file := write(t, filepath.Join(base, "file.txt"), "ours")

		f, err := OpenExistingReadonly(file)
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()

		if err := os.Remove(file); err == nil {
			t.Error("removed a file while held opn")
		}
		if _, err := os.Lstat(file); err != nil {
			t.Errorf("file went away anyway, %v", err)
		}
	})

	t.Run("refuses a rename while the handle is held", func(t *testing.T) {
		base := t.TempDir()
		file := write(t, filepath.Join(base, "file.txt"), "ours")

		f, err := OpenExistingReadonly(file)
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()

		if err := os.Rename(file, filepath.Join(base, "moved.txt")); err == nil {
			t.Error("renamed a file while held open")
		}
	})

	t.Run("let go of the pin once the handle is closed", func(t *testing.T) {
		base := t.TempDir()
		file := write(t, filepath.Join(base, "file.txt"), "ours")

		f, err := OpenExistingReadonly(file)
		if err != nil {
			t.Fatal(err)
		}
		if err := f.Close(); err != nil {
			t.Fatal(err)
		}
		if err := os.Remove(file); err != nil {
			t.Errorf("still pinned after close, %v", err)
		}
	})

	t.Run("pins what Create returns too", func(t *testing.T) {
		base := t.TempDir()
		file := filepath.Join(base, "new.txt")

		f, err := Create(file, 0o644)
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()

		if err := os.Remove(file); err == nil {
			t.Error("removed a file while held open")
		}
	})
}

func TestOpenChildPinned(t *testing.T) {
	openParentOf := func(t *testing.T, path string) windows.Handle {
		t.Helper()
		parent, _, err := OpenParent(path, traverseAccess)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = windows.CloseHandle(parent) })
		return parent
	}

	t.Run("pins a file", func(t *testing.T) {
		base := t.TempDir()
		file := write(t, filepath.Join(base, "file.txt"), "ours")

		h, err := OpenChildPinned(openParentOf(t, file), "file.txt", base, SecAccess)
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = windows.CloseHandle(h) }()

		if err := os.Remove(file); err == nil {
			t.Error("removed a file while it was held open")
		}
		if err := os.Rename(file, filepath.Join(base, "moved.txt")); err == nil {
			t.Error("renamed a file while it was held open")
		}
	})

	t.Run("keeps the link count from dropping", func(t *testing.T) {
		base := t.TempDir()
		target := write(t, filepath.Join(base, "target"), "important")
		link := hardlink(t, target, filepath.Join(base, "link"))

		h, err := OpenChildPinned(openParentOf(t, link), "link", base, SecAccess)
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = windows.CloseHandle(h) }()

		if err := os.Remove(link); err == nil {
			t.Error("dropped a link while it was held open??")
		}
		links, err := NumberOfLinks(h)
		if err != nil {
			t.Fatal(err)
		}
		if links != 2 {
			t.Errorf("link count %v != 2", links)
		}
	})

	t.Run("pins a directory", func(t *testing.T) {
		base := t.TempDir()
		dir := mkdir(t, filepath.Join(base, "sub"))

		h, err := OpenChildPinned(openParentOf(t, dir), "sub", base, SecAccess)
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = windows.CloseHandle(h) }()

		if err := os.Remove(dir); err == nil {
			t.Error("removed a directory while it was held open")
		}
	})
}

func TestOpenPathPinned(t *testing.T) {
	t.Run("pins a leaf file", func(t *testing.T) {
		file := write(t, filepath.Join(mkdir(t, filepath.Join(t.TempDir(), "sub")), "file.txt"), "ours")

		h, err := OpenPathPinned(file, SecAccess)
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = windows.CloseHandle(h) }()

		if err := os.Remove(file); err == nil {
			t.Error("removed a file while it was held open")
		}
	})

	t.Run("pins a leaf directory", func(t *testing.T) {
		dir := mkdir(t, filepath.Join(t.TempDir(), "sub"))

		h, err := OpenPathPinned(dir, SecAccess)
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = windows.CloseHandle(h) }()

		if err := os.Remove(dir); err == nil {
			t.Error("removed a directory while it was held open")
		}
	})
}
