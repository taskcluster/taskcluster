package cfg

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func makeRunnerConfig(implementation string) *RunnerConfig {
	return &RunnerConfig{
		WorkerImplementation: WorkerImplementationConfig{
			Implementation: implementation,
		},
	}
}

func TestPWCCorrectForm(t *testing.T) {
	runnercfg := makeRunnerConfig("test-worker")
	message := json.RawMessage(`{
      "testWorker": {
	    "config": {
		  "someValue": true
		},
		"files": [
		  {
			"description": "my file"
		  }
		]
	  }
	}`)
	pwc, err := ParseProviderWorkerConfig(runnercfg, &message)
	require.NoError(t, err)
	require.Equal(t, true, pwc.Config.MustGet("someValue"))
	require.Equal(t, "my file", pwc.Files[0].Description)
}

func TestPWCCompatibilityFlatFormForm(t *testing.T) {
	runnercfg := makeRunnerConfig("test-worker")
	message := json.RawMessage(`{
	  "someValue": true
	}`)
	pwc, err := ParseProviderWorkerConfig(runnercfg, &message)
	require.NoError(t, err)
	require.Equal(t, true, pwc.Config.MustGet("someValue"))
	require.Equal(t, 0, len(pwc.Files))
}

func TestPWCEmpty(t *testing.T) {
	runnercfg := makeRunnerConfig("test-worker")
	pwc, err := ParseProviderWorkerConfig(runnercfg, nil)
	require.NoError(t, err)
	require.Nil(t, pwc.Config)
	require.Equal(t, 0, len(pwc.Files))
}

func TestPWCBadForm(t *testing.T) {
	// we'll parse just about anything as a worker config, but if the top
	// level is not an object, that's an error
	runnercfg := makeRunnerConfig("test-worker")
	message := json.RawMessage(`"I am a string"`)
	_, err := ParseProviderWorkerConfig(runnercfg, &message)
	require.Error(t, err)
}
