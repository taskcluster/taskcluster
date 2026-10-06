package fileutil

import (
	"archive/tar"
	"compress/gzip"
	"os"
	"path/filepath"
	"testing"
)

// escapingLink returns a root directory containing a symlink named "link"
// that points to a directory outside of the root.
func escapingLink(t *testing.T) (root, outside string) {
	t.Helper()
	root = t.TempDir()
	outside = t.TempDir()
	if err := os.Symlink(outside, filepath.Join(root, "link")); err != nil {
		t.Skipf("Cannot create symlinks: %v", err)
	}
	return
}

func assertEmpty(t *testing.T, dir string) {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("Could not read %v: %v", dir, err)
	}
	if len(entries) != 0 {
		t.Fatalf("Was expecting nothing to be written to %v, but found %v", dir, entries)
	}
}

func writeTarGz(t *testing.T, path string, headers ...*tar.Header) {
	t.Helper()
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("Could not create %v: %v", path, err)
	}
	defer f.Close()
	gz := gzip.NewWriter(f)
	tw := tar.NewWriter(gz)
	for _, h := range headers {
		if err := tw.WriteHeader(h); err != nil {
			t.Fatalf("Could not write tar header %v: %v", h.Name, err)
		}
		if h.Typeflag == tar.TypeReg {
			if _, err := tw.Write(make([]byte, h.Size)); err != nil {
				t.Fatalf("Could not write tar entry %v: %v", h.Name, err)
			}
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatalf("Could not close tar writer: %v", err)
	}
	if err := gz.Close(); err != nil {
		t.Fatalf("Could not close gzip writer: %v", err)
	}
}

func TestCreateFileThroughEscapingSymlink(t *testing.T) {
	root, outside := escapingLink(t)
	if _, err := CreateFile(root, filepath.Join(root, "link", "file")); err == nil {
		t.Fatal("Was expecting CreateFile to refuse to follow a symlink out of the root")
	}
	assertEmpty(t, outside)
}

func TestCreateDirThroughEscapingSymlink(t *testing.T) {
	root, outside := escapingLink(t)
	if err := CreateDir(root, filepath.Join(root, "link", "dir")); err == nil {
		t.Fatal("Was expecting CreateDir to refuse to follow a symlink out of the root")
	}
	assertEmpty(t, outside)
}

func TestUnarchiveThroughEscapingSymlink(t *testing.T) {
	root, outside := escapingLink(t)
	archive := filepath.Join(root, "archive.tar.gz")
	writeTarGz(t, archive, &tar.Header{Name: "link/file", Typeflag: tar.TypeReg, Mode: 0644, Size: 4})

	if err := Unarchive(archive, root, root, "tar.gz"); err == nil {
		t.Fatal("Was expecting Unarchive to refuse to follow a symlink out of the root")
	}
	assertEmpty(t, outside)
}

func TestUnarchiveInsideRoot(t *testing.T) {
	root := t.TempDir()
	archive := filepath.Join(root, "archive.tar.gz")
	writeTarGz(t, archive,
		&tar.Header{Name: "dir/", Typeflag: tar.TypeDir, Mode: 0755},
		&tar.Header{Name: "dir/file", Typeflag: tar.TypeReg, Mode: 0644, Size: 4},
		&tar.Header{Name: "dir/link", Typeflag: tar.TypeSymlink, Linkname: "file"},
		&tar.Header{Name: "dir/setuid", Typeflag: tar.TypeReg, Mode: 04755, Size: 4},
	)
	dest := filepath.Join(root, "dest")
	if err := CreateDir(root, dest); err != nil {
		t.Fatalf("Could not create %v: %v", dest, err)
	}

	if err := Unarchive(archive, root, dest, "tar.gz"); err != nil {
		t.Fatalf("Could not unarchive %v: %v", archive, err)
	}
	if _, err := os.Stat(filepath.Join(dest, "dir", "file")); err != nil {
		t.Fatalf("Was expecting dir/file to be extracted: %v", err)
	}
	if target, err := os.Readlink(filepath.Join(dest, "dir", "link")); err != nil || target != "file" {
		t.Fatalf("Was expecting dir/link to link to file, but got %q: %v", target, err)
	}
	info, err := os.Stat(filepath.Join(dest, "dir", "setuid"))
	if err != nil {
		t.Fatalf("Was expecting dir/setuid to be extracted: %v", err)
	}
	if info.Mode()&os.ModeSetuid != 0 {
		t.Fatalf("Was expecting the setuid bit of dir/setuid to be dropped, but its mode is %v", info.Mode())
	}
}
