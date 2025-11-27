package main

import (
	"log"
	"syscall"

	"github.com/taskcluster/taskcluster/v94/workers/generic-worker/win32"
)

func freeDiskSpaceBytes(dir string) (uint64, error) {
	path, err := syscall.UTF16PtrFromString(".")
	if err != nil {
		return 0, err
	}
	var freeBytes uint64
	err = win32.GetDiskFreeSpace(path, &freeBytes, nil, nil)
	if err != nil {
		return 0, err
	}
	log.Printf("Disk available: %v bytes", freeBytes)
	return freeBytes, nil
}
