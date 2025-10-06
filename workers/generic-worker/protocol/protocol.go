package protocol

import (
	"bytes"
	"io"
	"log"
	"os"

	tcclient "github.com/taskcluster/taskcluster/v90/clients/client-go"
	"github.com/taskcluster/taskcluster/v90/tools/workerproto"
	"github.com/taskcluster/taskcluster/v90/workers/generic-worker/graceful"
)

var (
	// Protocol is the initialized worker-runner protocol instance.
	// This is initialized early in the worker run process and can be used
	// by any component after that time.
	Protocol *workerproto.Protocol

	// transport is the transport behind Protocol
	transport workerproto.Transport

	// credentialsUpdater is a callback function for updating credentials
	credentialsUpdater func(*tcclient.Credentials)
)

// CredentialsUpdater is a function type for updating worker credentials
type CredentialsUpdater func(*tcclient.Credentials)

// loggingWriter implements io.Writer and should be passed to a log instance
// as its Output. It will translate all written messages into messages to
// worker-runner, or if that is not supported output them to stderr as usual.
type loggingWriter struct {
	// when the protocol does not support logging, messages go to this logger.
	backup *log.Logger
}

func (w *loggingWriter) Write(p []byte) (n int, err error) {
	// https://golang.org/pkg/log/
	// > Each logging operation makes a single call to the Writer's Write method.
	message := string(bytes.TrimRight(p, "\n"))
	if Protocol.Capable("log") {
		Protocol.Send(workerproto.Message{
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

// Initialize sets up the worker process to interact with worker-runner or,
// if withWorkerRunner is false, sets up a "null" protocol that does not
// claim any capabilities.
//
// credUpdater is a callback function that will be called when new credentials
// are received from worker-runner.
func Initialize(input io.Reader, output io.Writer, withWorkerRunner bool, credUpdater CredentialsUpdater) {
	credentialsUpdater = credUpdater

	if withWorkerRunner {
		transp := workerproto.NewPipeTransport(input, output)
		transport = transp

		// set up to send everything that goes through the log package's default
		// logger through the protocol, with a backup strategy sending to stderr
		// location as the default logger.
		backup := log.New(os.Stderr, "", log.Flags())
		log.SetOutput(&loggingWriter{backup})
		log.SetFlags(0)
	} else {
		transport = workerproto.NewNullTransport()
	}

	Protocol = workerproto.NewProtocol(transport)

	startProtocol()

	// when not using worker-runner, consider the protocol initialized with no capabilities
	if !withWorkerRunner {
		Protocol.SetInitialized()
	}
}

// startProtocol registers capabilities and handlers for the protocol
func startProtocol() {
	Protocol.AddCapability("graceful-termination")
	Protocol.Register("graceful-termination", func(msg workerproto.Message) {
		finishTasks := msg.Properties["finish-tasks"].(bool)
		log.Printf("Got graceful-termination request with finish-tasks=%v", finishTasks)
		graceful.Terminate(finishTasks)
	})

	Protocol.AddCapability("new-credentials")
	Protocol.Register("new-credentials", func(msg workerproto.Message) {
		creds := tcclient.Credentials{
			ClientID:    msg.Properties["client-id"].(string),
			AccessToken: msg.Properties["access-token"].(string),
		}
		creds.Certificate, _ = msg.Properties["certificate"].(string)
		if credentialsUpdater != nil {
			credentialsUpdater(&creds)
		}
	})

	Protocol.AddCapability("error-report")
	Protocol.AddCapability("log")

	Protocol.Start(true)
}

// Teardown tears down the worker-runner protocol
func Teardown() {
	log.SetOutput(os.Stderr)
	log.SetFlags(log.LstdFlags)
	Protocol = nil
	transport = nil
}
