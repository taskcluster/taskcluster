package win32

import (
	"log"
	"syscall"
)

// These wrappers are used to be able to intercept system calls, and log what is being called...
type (
	LazyDLLWrapper struct {
		LazyDLL *syscall.LazyDLL
	}
	LazyProcWrapper struct {
		LazyProc *syscall.LazyProc
	}
)

func NewLazyDLL(name string) *LazyDLLWrapper {
	return &LazyDLLWrapper{
		LazyDLL: syscall.NewLazyDLL(name),
	}
}

func (l *LazyDLLWrapper) NewProc(name string) *LazyProcWrapper {
	return &LazyProcWrapper{
		LazyProc: l.LazyDLL.NewProc(name),
	}
}

func (p *LazyProcWrapper) Call(a ...uintptr) (r1, r2 uintptr, lastErr error) {
	log.Printf("Making system call %v with args: %X", p.LazyProc.Name, a)
	r1, r2, lastErr = p.LazyProc.Call(a...)
	log.Printf("  Result: %X %X %v", r1, r2, lastErr)
	return
}
