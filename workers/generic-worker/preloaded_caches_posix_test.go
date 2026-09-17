//go:build darwin || linux || freebsd

package main

import (
	"os"
	"path/filepath"
	"syscall"
	"testing"
)

func TestPreloadedCachePreservesAccess(t *testing.T) {
	seed := setupPreloadedCache(t)
	file := filepath.Join(seed, "src", "checkout")
	for _, path := range []string{seed, filepath.Join(seed, "src"), file} {
		if err := os.Chmod(path, 0770); err != nil {
			t.Fatal(err)
		}
		if os.Geteuid() == 0 {
			if err := os.Chown(path, 1000, 1000); err != nil {
				t.Fatal(err)
			}
		}
	}
	before, err := os.Stat(file)
	if err != nil {
		t.Fatal(err)
	}
	owner := before.Sys().(*syscall.Stat_t)
	initialisePreloadedCaches(t)
	root := directoryCaches["checkout"][0].Location
	for _, path := range []string{root, filepath.Join(root, "src"), filepath.Join(root, "src", "checkout")} {
		info, err := os.Stat(path)
		if err != nil {
			t.Fatal(err)
		}
		stat := info.Sys().(*syscall.Stat_t)
		if info.Mode().Perm() != 0770 || stat.Uid != owner.Uid || stat.Gid != owner.Gid {
			t.Fatalf("metadata changed for %s: mode=%v uid=%d gid=%d", path, info.Mode(), stat.Uid, stat.Gid)
		}
	}
}
