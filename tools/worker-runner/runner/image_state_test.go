package runner

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestWaitForImageStateComplete(t *testing.T) {
	results := []struct {
		state string
		err   error
	}{
		{err: errors.New("registry key is not available yet")},
		{state: "IMAGE_STATE_UNDEPLOYABLE"},
		{state: "IMAGE_STATE_SPECIALIZE_RESEAL_TO_OOBE"},
		{state: imageStateComplete},
	}

	reads := 0
	waits := 0
	waitForImageStateComplete(func() (string, error) {
		result := results[reads]
		reads++
		return result.state, result.err
	}, func() {
		waits++
	})

	require.Equal(t, len(results), reads)
	require.Equal(t, len(results)-1, waits)
}
