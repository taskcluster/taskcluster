package logging

import (
	"bytes"
	"log"
)

type unstructuredWriter struct{}

func (w *unstructuredWriter) Write(p []byte) (n int, err error) {
	// https://golang.org/pkg/log/
	// > Each logging operation makes a single call to the Writer's Write method.
	Destination.LogUnstructured(string(bytes.TrimRight(p, "\n")))
	n = len(p)
	return
}

// Patch a standard 'log' logger (or the default logger if nil) to write to the
// current Destination.  Flags are set to 0 because the Destination will
// add the necessary timestamps, etc.
func PatchStdLogger(l *log.Logger) {
	writer := &unstructuredWriter{}
	if l == nil {
		log.SetOutput(writer)
		log.SetFlags(0)
	} else {
		l.SetOutput(writer)
		l.SetFlags(0)
	}
}
