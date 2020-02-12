package main

import (
	"log"
	"syscall"
	"unsafe"
)

func freeDiskSpaceBytes(dir string) (uint64, error) {
	h := syscall.MustLoadDLL("kernel32.dll")
	c := h.MustFindProc("GetDiskFreeSpaceExW")
	var freeBytes int64
	var x, y uintptr
	_, _, err := c.Call(uintptr(unsafe.Pointer(syscall.StringToUTF16Ptr(dir))),
		uintptr(unsafe.Pointer(&freeBytes)), x, y)
	if err != syscall.Errno(0) {
		return 0, err
	}
	b := uint64(freeBytes)
	log.Printf("Disk available: %v bytes", b)
	return b, nil
}
