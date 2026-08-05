package safefs

import (
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
