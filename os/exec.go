package os

import (
	"os"
	"runtime"
	"sync/atomic"
)

// Process stores the information about a process created by StartProcess.
type Process struct {
	Pid    int
	handle uintptr
	isdone uint32 // process has been successfully waited on, non zero if true
}

func newProcess(pid int, handle uintptr) *Process {
	p := &Process{Pid: pid, handle: handle}
	runtime.SetFinalizer(p, (*os.Process).Release)
	return p
}

func (p *Process) setDone() {
	atomic.StoreUint32(&p.isdone, 1)
}
