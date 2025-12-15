package main

import (
	"bytes"
	"io"
	"log"
	"os"

	tcclient "github.com/taskcluster/taskcluster/v95/clients/client-go"
	"github.com/taskcluster/taskcluster/v95/tools/workerproto"
	"github.com/taskcluster/taskcluster/v95/workers/generic-worker/graceful"
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
			Properties: map[string]any{
				"body": map[string]any{
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

	startProtocol()

	// when not using worker-runner, consider the protocol initialized with no capabilities
	if !withWorkerRunner {
		WorkerRunnerProtocol.SetInitialized()
	}
}

// Start the protocol once WorkerRunnerProtocol has been initialized
func startProtocol() {
	WorkerRunnerProtocol.AddCapability("graceful-termination")
	WorkerRunnerProtocol.Register("graceful-termination", func(msg workerproto.Message) {
		finishTasks := msg.Properties["finish-tasks"].(bool)
		log.Printf("Got graceful-termination request with finish-tasks=%v", finishTasks)
		graceful.Terminate(finishTasks)
	})

	WorkerRunnerProtocol.AddCapability("new-credentials")
	WorkerRunnerProtocol.Register("new-credentials", func(msg workerproto.Message) {
		creds := tcclient.Credentials{
			ClientID:    msg.Properties["client-id"].(string),
			AccessToken: msg.Properties["access-token"].(string),
		}
		creds.Certificate, _ = msg.Properties["certificate"].(string)
		config.UpdateCredentials(&creds)
	})

	WorkerRunnerProtocol.AddCapability("error-report")
	WorkerRunnerProtocol.AddCapability("log")
	WorkerRunnerProtocol.AddCapability("shutdown")

	WorkerRunnerProtocol.Start(true)
}

func teardownWorkerRunnerProtocol() {
	log.SetOutput(os.Stderr)
	log.SetFlags(log.LstdFlags)
	WorkerRunnerProtocol = nil
	workerRunnerTransport = nil
}
