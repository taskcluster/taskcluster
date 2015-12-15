package os

import "os"

// StartProcess starts a new process with the program, arguments and attributes
// specified by name, argv and attr.
//
// StartProcess is a low-level interface. The os/exec package provides
// higher-level interfaces.
//
// If there is an error, it will be of type *PathError.
func StartProcess(name string, argv []string, attr *os.ProcAttr) (*os.Process, error) {
	return startProcess(name, argv, attr)
}
