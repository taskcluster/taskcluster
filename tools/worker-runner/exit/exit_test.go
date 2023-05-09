package exit

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/tc"
	"github.com/taskcluster/taskcluster/v50/tools/workerproto"
	ptesting "github.com/taskcluster/taskcluster/v50/tools/workerproto/testing"
)

func TestShutdownMessage(t *testing.T) {
	wkr := ptesting.NewFakeWorkerWithCapabilities("shutdown")
	defer wkr.Close()

	runnercfg := cfg.RunnerConfig{}
	runnercfg.Provider.ProviderType = "azure"
	state := run.State{
		WorkerPoolID: "w/p",
		WorkerGroup:  "wg",
		WorkerID:     "wid",
	}
	em := new(&runnercfg, &state, tc.FakeWorkerManagerClientFactory)

	em.SetProtocol(wkr.RunnerProtocol)
	wkr.RunnerProtocol.Start(false)
	wkr.RunnerProtocol.WaitUntilInitialized()
	wkr.WorkerProtocol.Start(true)

	wkr.WorkerProtocol.Send(workerproto.Message{
		Type:       "shutdown",
		Properties: map[string]interface{}{},
	})
	wkr.FlushMessagesToRunner()

	removals := tc.FakeWorkerManagerWorkerRemovals()
	require.Equal(t, len(removals), 1)
	removal := removals[0]
	require.Equal(t, removal.WorkerPoolID, state.WorkerPoolID)
	require.Equal(t, removal.WorkerGroup, state.WorkerGroup)
	require.Equal(t, removal.WorkerID, state.WorkerID)
}

func TestShutdownDynamic(t *testing.T) {
	runnercfg := cfg.RunnerConfig{}
	runnercfg.Provider.ProviderType = "azure"
	state := run.State{
		WorkerPoolID: "w/p",
		WorkerGroup:  "wg",
		WorkerID:     "wid",
	}
	em := new(&runnercfg, &state, tc.FakeWorkerManagerClientFactory)

	em.shutdown()

	removals := tc.FakeWorkerManagerWorkerRemovals()
	require.Equal(t, len(removals), 1)
	removal := removals[0]
	require.Equal(t, removal.WorkerPoolID, state.WorkerPoolID)
	require.Equal(t, removal.WorkerGroup, state.WorkerGroup)
	require.Equal(t, removal.WorkerID, state.WorkerID)
}

func TestShutdownStatic(t *testing.T) {
	runnercfg := cfg.RunnerConfig{}
	runnercfg.Provider.ProviderType = "static"
	state := run.State{}
	em := new(&runnercfg, &state, tc.FakeWorkerManagerClientFactory)

	em.shutdown()

	removals := tc.FakeWorkerManagerWorkerRemovals()
	require.Equal(t, len(removals), 0)
}
