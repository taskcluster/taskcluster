package logging

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster/v92/tools/worker-runner/logging"
	"github.com/taskcluster/taskcluster/v92/tools/workerproto"
	ptesting "github.com/taskcluster/taskcluster/v92/tools/workerproto/testing"
)

func TestLoggingProtocol(t *testing.T) {
	oldLogDestination := logging.Destination
	defer func() { logging.Destination = oldLogDestination }()
	logDest := &logging.TestLogDestination{}
	logging.Destination = logDest

	wkr := ptesting.NewFakeWorkerWithCapabilities("log")
	defer wkr.Close()

	SetProtocol(wkr.RunnerProtocol)
	wkr.RunnerProtocol.Start(false)

	// wait for the worker protocol to be initialized before sending
	// any log messages
	wkr.WorkerProtocol.WaitUntilInitialized()

	waitForLogMessage := func() {
		for len(logDest.Messages()) == 0 {
			time.Sleep(10 * time.Millisecond)
		}
	}

	t.Run("well-formed log message from worker", func(t *testing.T) {
		defer logDest.Clear()
		wkr.WorkerProtocol.Send(workerproto.Message{
			Type: "log",
			Properties: map[string]any{
				"body": map[string]any{
					"metric": "foos",
					"value":  10,
				},
			},
		})

		waitForLogMessage()

		require.Equal(t,
			[]map[string]any{
				map[string]any{
					"metric": "foos",
					"value":  10.0,
				},
			},
			logDest.Messages(),
		)
	})

	t.Run("badly-formed log message from worker", func(t *testing.T) {
		defer logDest.Clear()
		wkr.WorkerProtocol.Send(workerproto.Message{
			Type: "log",
			Properties: map[string]any{
				"textPayload": "I forgot about the body property, oops",
			},
		})

		waitForLogMessage()

		require.Equal(t,
			[]map[string]any{
				map[string]any{
					"textPayload": "received log message from worker lacking 'body' property",
				},
			},
			logDest.Messages(),
		)
	})
}
