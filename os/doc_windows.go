package os

import "os"

// StartProcess starts a new process with the program, arguments and attributes
// specified by name, argv and attr.
//
// StartProcess is a low-level interface. The os/exec package provides
// higher-level interfaces.
//
// If there is an error, it will be of type *PathError.
func StartProcess(name string, argv []string, attr *os.ProcAttr, username, password string) (*Process, error) {
	return startProcess(name, argv, attr, username, password)
}

// Wait waits for the Process to exit, and then returns a
// ProcessState describing its status and an error, if any.
// Wait releases any resources associated with the Process.
// On most operating systems, the Process must be a child
// of the current process or an error will be returned.
func (p *Process) Wait() (*ProcessState, error) {
	return p.wait()
}

// Release releases any resources associated with the Process p,
// rendering it unusable in the future.
// Release only needs to be called if Wait is not.
func (p *Process) Release() error {
	return p.release()
}

// Success reports whether the program exited successfully,
// such as with exit status 0 on Unix.
func (p *ProcessState) Success() bool {
	return p.success()
}

func (p *ProcessState) success() bool {
	return p.status.ExitStatus() == 0
}

// Sys returns system-dependent exit information about
// the process.  Convert it to the appropriate underlying
// type, such as syscall.WaitStatus on Unix, to access its contents.
func (p *ProcessState) Sys() interface{} {
	return p.sys()
}

// Kill causes the Process to exit immediately.
func (p *Process) Kill() error {
	if p == nil || p.handle == 0 {
		return nil
	}
	return p.kill()
}

// Signal sends a signal to the Process.
// Sending Interrupt on Windows is not implemented.
func (p *Process) Signal(sig os.Signal) error {
	return p.signal(sig)
}
