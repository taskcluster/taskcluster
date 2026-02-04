package gwconfig

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidatePortConfiguration(t *testing.T) {
	// Base config that should always pass validation (other than ports)
	baseConfig := func() *Config {
		return &Config{
			PublicConfig: PublicConfig{
				Capacity:                  1,
				EnableInteractive:         true,
				EnableLiveLog:             true,
				EnableTaskclusterProxy:    true,
				LiveLogPortBase:           60000,
				InteractivePort:           53000,
				TaskclusterProxyPort:      8080,
				CachesDir:                 "/tmp/caches",
				ClientID:                  "test-client",
				DownloadsDir:              "/tmp/downloads",
				Ed25519SigningKeyLocation: "/tmp/key",
				LiveLogExecutable:         "/usr/bin/livelog",
				ProvisionerID:             "test-provisioner",
				RootURL:                   "https://example.com",
				TasksDir:                  "/tmp/tasks",
				WorkerGroup:               "test-group",
				WorkerID:                  "test-worker",
				WorkerType:                "test-type",
			},
			PrivateConfig: PrivateConfig{
				AccessToken: "test-token",
			},
		}
	}

	t.Run("capacity=1 skips validation", func(t *testing.T) {
		c := baseConfig()
		c.Capacity = 1
		// Even with overlapping ports, capacity=1 should skip validation
		c.LiveLogPortBase = 8080
		c.TaskclusterProxyPort = 8080
		err := c.ValidatePortConfiguration()
		require.NoError(t, err)
	})

	t.Run("non-overlapping ports pass", func(t *testing.T) {
		c := baseConfig()
		c.Capacity = 5
		c.LiveLogPortBase = 60000     // Uses 60000-60019 (5 slots * 4 ports)
		c.InteractivePort = 53000     // Uses 53000-53016
		c.TaskclusterProxyPort = 8080 // Uses 8080-8096
		err := c.ValidatePortConfiguration()
		require.NoError(t, err)
	})

	t.Run("overlapping LiveLog and Interactive fails", func(t *testing.T) {
		c := baseConfig()
		c.Capacity = 5
		c.LiveLogPortBase = 60000
		c.InteractivePort = 60010 // Overlaps with LiveLog range
		c.TaskclusterProxyPort = 8080
		err := c.ValidatePortConfiguration()
		require.Error(t, err)
		require.Contains(t, err.Error(), "port range overlap detected")
		require.Contains(t, err.Error(), "livelogPortBase")
		require.Contains(t, err.Error(), "interactivePort")
	})

	t.Run("overlapping LiveLog and TaskclusterProxy fails", func(t *testing.T) {
		c := baseConfig()
		c.Capacity = 3
		c.LiveLogPortBase = 8080
		c.InteractivePort = 53000
		c.TaskclusterProxyPort = 8085 // Overlaps with LiveLog range
		err := c.ValidatePortConfiguration()
		require.Error(t, err)
		require.Contains(t, err.Error(), "port range overlap detected")
	})

	t.Run("identical ports fail", func(t *testing.T) {
		c := baseConfig()
		c.Capacity = 2
		c.LiveLogPortBase = 8080
		c.InteractivePort = 8080
		c.TaskclusterProxyPort = 8080
		err := c.ValidatePortConfiguration()
		require.Error(t, err)
		require.Contains(t, err.Error(), "port range overlap detected")
	})

	t.Run("high capacity requires more spacing", func(t *testing.T) {
		c := baseConfig()
		c.Capacity = 10
		// With capacity 10, each port range spans 36 ports (9 slots * 4 offset)
		c.LiveLogPortBase = 60000 // 60000-60037
		c.InteractivePort = 60030 // 60030-60066 - overlaps!
		c.TaskclusterProxyPort = 8080
		err := c.ValidatePortConfiguration()
		require.Error(t, err)
		require.Contains(t, err.Error(), "port range overlap detected")
	})

	t.Run("disabled features are excluded", func(t *testing.T) {
		c := baseConfig()
		c.Capacity = 5
		c.EnableLiveLog = false
		// Overlaps with LiveLog range, but LiveLog is disabled so should pass.
		c.LiveLogPortBase = 60000
		c.InteractivePort = 60010
		c.TaskclusterProxyPort = 8080
		err := c.ValidatePortConfiguration()
		require.NoError(t, err)
	})
}
