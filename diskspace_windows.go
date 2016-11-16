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

// *************************************************************************
// We can probably delete this, it is an alternative version in case we have
// problems with simpler version above
// *************************************************************************
func freeDiskSpaceBytes2(dir string) (uint64, error) {
	kernel32, err := syscall.LoadLibrary("Kernel32.dll")
	if err != nil {
		log.Panic(err)
	}
	defer syscall.FreeLibrary(kernel32)
	GetDiskFreeSpaceEx, err := syscall.GetProcAddress(syscall.Handle(kernel32), "GetDiskFreeSpaceExW")
	if err != nil {
		return 0, err
	}
	lpFreeBytesAvailable := int64(0)
	lpTotalNumberOfBytes := int64(0)
	lpTotalNumberOfFreeBytes := int64(0)
	r, a, b := syscall.Syscall6(
		uintptr(GetDiskFreeSpaceEx),
		4,
		uintptr(unsafe.Pointer(syscall.StringToUTF16Ptr("C:"))),
		uintptr(unsafe.Pointer(&lpFreeBytesAvailable)),
		uintptr(unsafe.Pointer(&lpTotalNumberOfBytes)),
		uintptr(unsafe.Pointer(&lpTotalNumberOfFreeBytes)),
		0,
		0,
	)
	log.Print("Disk space:", r, a, b, lpFreeBytesAvailable, lpTotalNumberOfBytes, lpTotalNumberOfFreeBytes)
	return uint64(lpFreeBytesAvailable), nil
}
