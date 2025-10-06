package protocol

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster/v90/tools/workerproto"
	wptesting "github.com/taskcluster/taskcluster/v90/tools/workerproto/testing"
	"github.com/taskcluster/taskcluster/v90/workers/generic-worker/graceful"
	"github.com/taskcluster/taskcluster/v90/workers/generic-worker/gwconfig"
	tcclient "github.com/taskcluster/taskcluster/v90/clients/client-go"
)

func setupWorkerRunnerTest(t *testing.T, config *gwconfig.Config, runnerCapabilities ...string) *workerproto.Protocol {
	t.Helper()
	graceful.Reset()
	workerTransport, runnerTransport := wptesting.NewLocalTransportPair()

	// set up the runner side of the protocol
	runnerProto := workerproto.NewProtocol(runnerTransport)
	for _, cap := range runnerCapabilities {
		runnerProto.AddCapability(cap)
	}
	runnerProto.Start(false)

	// set up the worker side of the protocol
	Protocol = workerproto.NewProtocol(workerTransport)
	credentialsUpdater = func(creds *tcclient.Credentials) {
		if config != nil {
			config.UpdateCredentials(creds)
		}
	}
	startProtocol()

	runnerProto.WaitUntilInitialized()

	t.Cleanup(func() {
		runnerTransport.Close()
		workerTransport.Close()
	})

	return runnerProto
}

func TestGracefulTermination(t *testing.T) {
	runnerProto := setupWorkerRunnerTest(t, nil, "graceful-termination")

	require.False(t, graceful.TerminationRequested())

	done := make(chan bool, 1)

	graceful.OnTerminationRequest(func(finishTasks bool) {
		done <- finishTasks
	})

	runnerProto.Send(workerproto.Message{
		Type: "graceful-termination",
		Properties: map[string]any{
			"finish-tasks": true,
		},
	})

	finishTasks := <-done
	require.True(t, finishTasks)
	require.True(t, graceful.TerminationRequested())
}

func TestNewCredentials(t *testing.T) {
	config := &gwconfig.Config{}

	runnerProto := setupWorkerRunnerTest(t, config, "new-credentials")

	test := func(withCert bool) func(*testing.T) {
		return func(t *testing.T) {
			t.Helper()
			config.ClientID = "old"
			clientID := fmt.Sprintf("client-cert-%v", withCert)

			properties := map[string]any{
				"client-id":    clientID,
				"access-token": "big-secret",
			}
			if withCert {
				properties["certificate"] = "CERT"
			}

			runnerProto.Send(workerproto.Message{
				Type:       "new-credentials",
				Properties: properties,
			})

			// messages are handled asynchronously, so poll until
			// seeing the updated creds

			for range 200 {
				creds := config.Credentials()
				if creds.ClientID != "old" {
					require.Equal(t, clientID, creds.ClientID)
					require.Equal(t, "big-secret", creds.AccessToken)
					if withCert {
						require.Equal(t, "CERT", creds.Certificate)
					} else {
						require.Equal(t, "", creds.Certificate)
					}
					return
				}
				time.Sleep(10 * time.Millisecond)
			}
			panic("credentials update not observed")
		}
	}

	t.Run("WithCertificate", test(true))
	t.Run("WithoutCertificate", test(false))
}
