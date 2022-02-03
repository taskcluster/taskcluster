package win32

import (
	"os"
	"syscall"
	"unsafe"
)

func unpackConditionMask(cm uint64) (m1, m2 uintptr) {
	return uintptr(cm & 0xffffffff), uintptr(cm >> 32)
}

func packConditionMask(m1, m2 uintptr) uint64 {
	return uint64(m1) | uint64(m2)<<32
}

func VerSetConditionMask(lConditionMask uint64, typeBitMask uint32, conditionMask uint8) uint64 {
	m1, m2 := unpackConditionMask(lConditionMask)

	r1, r2, _ := syscall.Syscall6(
		procVerSetConditionMask.Addr(),
		4,
		m1,
		m2,
		uintptr(typeBitMask),
		uintptr(conditionMask),
		0,
		0,
	)
	return packConditionMask(r1, r2)
}

func VerifyWindowsInfoW(vi OSVersionInfoEx, typeMask uint32, conditionMask uint64) (bool, error) {
	m1, m2 := unpackConditionMask(conditionMask)
	vi.OSVersionInfoSize = uint32(unsafe.Sizeof(vi))

	r1, _, e1 := syscall.Syscall6(
		procVerifyVersionInfoW.Addr(),
		4,
		uintptr(unsafe.Pointer(&vi)),
		uintptr(typeMask),
		m1,
		m2,
		0,
		0,
	)
	if r1 != 0 {
		return true, nil
	}
	if r1 == 0 && e1 == ERROR_OLD_WIN_VERSION {
		return false, nil
	}
	return false, os.NewSyscallError("VerifyVersionInfoW", e1)
}
