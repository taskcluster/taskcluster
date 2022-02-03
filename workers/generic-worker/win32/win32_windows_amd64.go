package win32

import (
	"os"
	"syscall"
	"unsafe"
)

func VerSetConditionMask(lConditionMask uint64, typeBitMask uint32, conditionMask uint8) uint64 {
	r1, _, _ := syscall.Syscall(
		procVerSetConditionMask.Addr(),
		3,
		uintptr(lConditionMask),
		uintptr(typeBitMask),
		uintptr(conditionMask),
	)
	return uint64(r1)
}

func VerifyWindowsInfoW(vi OSVersionInfoEx, typeMask uint32, conditionMask uint64) (bool, error) {
	vi.OSVersionInfoSize = uint32(unsafe.Sizeof(vi))

	r1, _, e1 := syscall.Syscall(
		procVerifyVersionInfoW.Addr(),
		3,
		uintptr(unsafe.Pointer(&vi)),
		uintptr(typeMask),
		uintptr(conditionMask),
	)
	if r1 != 0 {
		return true, nil
	}
	if r1 == 0 && e1 == ERROR_OLD_WIN_VERSION {
		return false, nil
	}
	return false, os.NewSyscallError("VerifyVersionInfoW", e1)
}
