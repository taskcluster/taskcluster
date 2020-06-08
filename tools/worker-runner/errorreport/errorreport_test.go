package errorreport

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster/v30/clients/client-go/tcworkermanager"
	"github.com/taskcluster/taskcluster/v30/internal/workerproto"
	ptesting "github.com/taskcluster/taskcluster/v30/internal/workerproto/testing"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v30/tools/worker-runner/tc"
)

func TestHandleMessage(t *testing.T) {
	description := "this is a serious error"
	extra := map[string]interface{}{
		"foo": "bar",
	}
	kind := "severe"
	title := "test error"

	t.Run("with capability", func(t *testing.T) {
		wkr := ptesting.NewFakeWorkerWithCapabilities("error-report")
		defer wkr.Close()

		state := run.State{}
		wkr.RunnerProtocol.Register("error-report", func(msg workerproto.Message) {
			HandleMessage(msg, tc.FakeWorkerManagerClientFactory, &state)
		})
		wkr.RunnerProtocol.AddCapability("error-report")
		wkr.RunnerProtocol.Start(false)
		wkr.RunnerProtocol.WaitUntilInitialized()
		wkr.WorkerProtocol.Start(true)
		wkr.WorkerProtocol.Send(workerproto.Message{
			Type: "error-report",
			Properties: map[string]interface{}{
				"description": description,
				"extra":       extra,
				"kind":        kind,
				"title":       title,
			},
		})

		var reports []*tcworkermanager.WorkerErrorReport
		var err error
		func() {
			for i := 0; i < 200; i++ {
				reports, err = tc.FakeWorkerManagerWorkerErrorReports()
				if len(reports) == 1 {
					return
				}
				time.Sleep(10 * time.Millisecond)
			}
			panic("worker error report not received")
		}()
		require.NoError(t, err)
		require.Len(t, reports, 1)

		require.Equal(t, description, reports[0].Description)
		require.Equal(t, kind, reports[0].Kind)
		require.Equal(t, title, reports[0].Title)

		receivedExtra, err := reports[0].Extra.MarshalJSON()
		require.NoError(t, err)
		sentExtra, err := json.Marshal(extra)
		require.NoError(t, err)
		require.Equal(t, sentExtra, receivedExtra)

		require.True(t, true)
	})

	t.Run("without capability", func(t *testing.T) {
		wkr := ptesting.NewFakeWorkerWithCapabilities()
		defer wkr.Close()

		wkr.RunnerProtocol.Start(false)
		wkr.RunnerProtocol.WaitUntilInitialized()
		wkr.WorkerProtocol.Start(true)
		wkr.WorkerProtocol.Send(workerproto.Message{
			Type: "error-report",
			Properties: map[string]interface{}{
				"description": description,
				"extra":       extra,
				"kind":        kind,
				"title":       title,
			},
		})

		// note that without a delay we may not have waited
		// long enough for potential calls to finish

		reports, err := tc.FakeWorkerManagerWorkerErrorReports()
		require.Errorf(t, err, "No reportWorkerError calls")
		require.Len(t, reports, 0)
	})
}
