//go:build darwin || linux || freebsd

package safefs

import (
	"path/filepath"
	"testing"
)

func TestExists(t *testing.T) {
	base := untrustedTempDir(t)
	write(t, filepath.Join(base, "file"), "x")
	mkdir(t, filepath.Join(base, "dir"))
	mkfifo(t, filepath.Join(base, "fifo"))
	symlink(t, filepath.Join(base, "file"), filepath.Join(base, "tofile"))
	symlink(t, filepath.Join(base, "narnia"), filepath.Join(base, "dangling"))

	mkdir(t, filepath.Join(base, "elsewhere", "sub"))
	stage := symlink(t, filepath.Join(base, "elsewhere", "sub"), filepath.Join(base, "stage"))
	mkdir(t, filepath.Join(base, "target"))

	for _, tc := range []struct {
		name    string
		path    string
		exists  bool
		refused bool
	}{
		{"a file", filepath.Join(base, "file"), true, false},
		{"a directory", filepath.Join(base, "dir"), true, false},
		{"a fifo", filepath.Join(base, "fifo"), true, false},
		{"a symlink to a file", filepath.Join(base, "tofile"), true, false},
		{"a dangling symlink", filepath.Join(base, "dangling"), true, false},
		{"an absent leaf", filepath.Join(base, "gonebuyingmilk"), false, false},
		{"an absent parent", filepath.Join(base, "no", "such", "parent", "leaf"), false, false},
		{"a symlinked prefix", filepath.Join(stage, "leaf"), false, true},
		// lstat would walk the symlink and miss this one entirely
		{"a symlinked prefix cleaned away by ..", stage + "/../target", true, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			exists, err := Exists(tc.path)
			if tc.refused {
				if err == nil {
					t.Fatal("was expecting the path to be refused")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if exists != tc.exists {
				t.Errorf("exists = %v, want %v", exists, tc.exists)
			}
		})
	}
}
