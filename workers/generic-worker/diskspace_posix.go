//go:build darwin || linux || freebsd

package main

import (
	"syscall"
)

func freeDiskSpaceBytes(dir string) (uint64, error) {
	var stat syscall.Statfs_t
	err := syscall.Statfs(dir, &stat)
	if err != nil {
		return 0, err
	}
	// Available blocks * size per block = available space in bytes
	return uint64(stat.Bavail) * uint64(stat.Bsize), nil
}
