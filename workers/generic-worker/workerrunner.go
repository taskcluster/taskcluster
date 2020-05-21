package main

import (
	"bytes"
	"io"
	"log"
	"os"

	"github.com/taskcluster/taskcluster/v30/internal/workerproto"
)

var (
	// Support for communication betweeen this process and worker-runner.  This
	// is initialized early in the `generic-worker run` process and can be used
	// by any component after that time.
	WorkerRunnerProtocol *workerproto.Protocol

	// The transport behind WorkerRunnerProtocol
	workerRunnerTransport workerproto.Transport
)

// A loggingWriter implements io.Writer and should be passed to a `log` instance
// as its Output.  It will translate all written messages into messages to
// worker-runner, or if that is not supported output them to stderr as usual.
type loggingWriter struct {
	// when the protocol does not support logging, messages go to this logger.
	backup *log.Logger
}

func (w *loggingWriter) Write(p []byte) (n int, err error) {
	// https://golang.org/pkg/log/
	// > Each logging operation makes a single call to the Writer's Write method.
	message := string(bytes.TrimRight(p, "\n"))
	if WorkerRunnerProtocol.Capable("log") {
		WorkerRunnerProtocol.Send(workerproto.Message{
			Type: "log",
			Properties: map[string]interface{}{
				"body": map[string]interface{}{
					"textPayload": message,
				},
			},
		})
	} else {
		w.backup.Println(message)
	}

	n = len(p)
	return
}

// Set up the worker process to interact with worker-runner or, if withWorkerRunner is false,
// set up a "null" protocol that does not claim any capabilities.
func initializeWorkerRunnerProtocol(input io.Reader, output io.Writer, withWorkerRunner bool) {
	if withWorkerRunner {
		transp := workerproto.NewPipeTransport(input, output)
		workerRunnerTransport = transp

		// set up to send everything that goes through the log package's default
		// logger through the protocol, with a backup strategy sending to stderr
		// location as the default logger.
		backup := log.New(os.Stderr, "", log.Flags())
		log.SetOutput(&loggingWriter{backup})
		log.SetFlags(0)
	} else {
		workerRunnerTransport = workerproto.NewNullTransport()
	}

	WorkerRunnerProtocol = workerproto.NewProtocol(workerRunnerTransport)
	WorkerRunnerProtocol.AddCapability("graceful-termination")
	WorkerRunnerProtocol.AddCapability("log")
	WorkerRunnerProtocol.Start(true)

	// when not using worker-runner, consider the protocol initialized with no capabilities
	if !withWorkerRunner {
		WorkerRunnerProtocol.SetInitialized()
	}
}

func teardownWorkerRunnerProtocol() {
	log.SetOutput(os.Stderr)
	log.SetFlags(log.LstdFlags)
	WorkerRunnerProtocol = nil
	workerRunnerTransport = nil
}
