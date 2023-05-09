package run

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/Flaque/filet"
	"github.com/stretchr/testify/require"
	taskcluster "github.com/taskcluster/taskcluster/v50/clients/client-go"
)

func makeState() State {
	return State{
		RootURL: "https://tc.example.com",
		Credentials: taskcluster.Credentials{
			ClientID: "cli",
		},
		WorkerPoolID: "wp/id",
		WorkerGroup:  "wg",
		WorkerID:     "wid",
		WorkerLocation: map[string]string{
			"cloud": "mushroom",
		},
	}
}

func TestCheckProviderResultsNoRootURL(t *testing.T) {
	state := makeState()
	state.RootURL = ""
	require.Error(t, state.CheckProviderResults())
}

func TestCheckProviderResultsRootURLwithSlash(t *testing.T) {
	state := makeState()
	state.RootURL = "https://tc.example.com/"
	require.Error(t, state.CheckProviderResults())
}

func TestCheckProviderResultsNoClientID(t *testing.T) {
	state := makeState()
	state.Credentials.ClientID = ""
	require.Error(t, state.CheckProviderResults())
}

func TestCheckProviderResultsNoWorkerPoolID(t *testing.T) {
	state := makeState()
	state.WorkerPoolID = ""
	require.Error(t, state.CheckProviderResults())
}

func TestCheckProviderResultsNoWorkerGroup(t *testing.T) {
	state := makeState()
	state.WorkerGroup = ""
	require.Error(t, state.CheckProviderResults())
}

func TestCheckProviderResultsNoWorkerID(t *testing.T) {
	state := makeState()
	state.WorkerID = ""
	require.Error(t, state.CheckProviderResults())
}

func TestCheckProviderResultsNoCloud(t *testing.T) {
	state := makeState()
	delete(state.WorkerLocation, "cloud")
	require.Error(t, state.CheckProviderResults())
}

func TestReadCacheFile(t *testing.T) {
	defer filet.CleanUp(t)
	dir := filet.TmpDir(t, "")
	cachePath := filepath.Join(dir, "cache.json")

	t.Run("NotFound", func(t *testing.T) {
		var state State
		found, err := ReadCacheFile(&state, cachePath)
		require.NoError(t, err)
		require.False(t, found)
	})

	t.Run("Found", func(t *testing.T) {
		var state State

		var cachedState = &State{
			RootURL: "foo",
		}
		err := cachedState.WriteCacheFile(cachePath)
		require.NoError(t, err)

		found, err := ReadCacheFile(&state, cachePath)

		require.NoError(t, err)
		require.True(t, found)
		require.Equal(t, "foo", state.RootURL)
	})

	// The perms package checks handling of perms across platforms; here we
	// only need to check that ReadCacheFile correctly handles the error from
	// that package, and it is easiest to trigger that on linux.
	if runtime.GOOS == "linux" {
		t.Run("BadPerms", func(t *testing.T) {
			var state State
			cachePath := filepath.Join(dir, "cache-badperms.json")

			err := os.WriteFile(cachePath, []byte(`{"RootURL":"foo"}`), 0644)
			require.NoError(t, err)

			found, err := ReadCacheFile(&state, cachePath)

			require.Error(t, err)
			require.True(t, found)
			require.NotEqual(t, "foo", state.RootURL)
		})
	}
}
