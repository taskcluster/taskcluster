//go:build darwin || linux || freebsd

package safefs

import (
	"os"
	"path/filepath"
	"testing"
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
