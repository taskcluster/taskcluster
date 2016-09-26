// +build !windows

package main

import (
	"log"
	"syscall"
)

func freeDiskSpaceBytes(dir string) (uint64, error) {
	var stat syscall.Statfs_t
	err := syscall.Statfs(dir, &stat)
	if err != nil {
		return 0, err
	}
	// Available blocks * size per block = available space in bytes
	b := stat.Bavail * uint64(stat.Bsize)
	log.Printf("Disk available: %v bytes", b)
	return b, nil
}
