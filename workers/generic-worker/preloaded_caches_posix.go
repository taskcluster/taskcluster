//go:build darwin || linux || freebsd

package main

import (
	"os"
	"syscall"
)

func preservePreloadedOwnership(path string, info os.FileInfo) error {
	stat := info.Sys().(*syscall.Stat_t)
	if err := os.Chown(path, int(stat.Uid), int(stat.Gid)); err != nil {
		return err
	}
	return os.Chmod(path, info.Mode().Perm())
}
