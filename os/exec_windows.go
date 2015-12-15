package os

import (
	"os"
	"runtime"
	"sync/atomic"
	"syscall"
)

func (p *Process) release() error {
	handle := atomic.LoadUintptr(&p.handle)
	if handle == uintptr(syscall.InvalidHandle) {
		return syscall.EINVAL
	}
	e := syscall.CloseHandle(syscall.Handle(handle))
	if e != nil {
		return os.NewSyscallError("CloseHandle", e)
	}
	atomic.StoreUintptr(&p.handle, uintptr(syscall.InvalidHandle))
	// no need for a finalizer anymore
	runtime.SetFinalizer(p, nil)
	return nil
}
