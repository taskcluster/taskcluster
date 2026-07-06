package cfg

import (
	"os"
	"path"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster/v101/tools/worker-runner/perms"
)

// copyTestConfigToTempFile copies the checked-in test-config.yml into a
// temporary directory so tests that need to mutate file permissions don't
// touch the source tree. An explicit Chmod is applied after the write so
// the resulting mode is deterministic regardless of the test runner's
// umask (which would otherwise mask the mode passed to os.WriteFile).
func copyTestConfigToTempFile(t *testing.T, mode os.FileMode) string {
	t.Helper()
	_, sourceFilename, _, _ := runtime.Caller(0)
	src := path.Join(path.Dir(sourceFilename), "test-config.yml")
	data, err := os.ReadFile(src)
	require.NoError(t, err)
	dst := filepath.Join(t.TempDir(), "runner.yml")
	require.NoError(t, os.WriteFile(dst, data, mode))
	require.NoError(t, os.Chmod(dst, mode))
	return dst
}

func TestLoadConfig(t *testing.T) {
	cfgPath := copyTestConfigToTempFile(t, 0600)

	runnercfg, err := LoadRunnerConfig(cfgPath)
	if err != nil {
		t.Fatalf("failed to load: %s", err)
	}

	assert.Equal(t, "ec2", runnercfg.Provider.ProviderType, "should read providerType correctly")
	assert.Equal(t, 10.0, runnercfg.WorkerConfig.MustGet("x"), "should read workerConfig correctly")
	assert.Equal(t, true, runnercfg.GetSecrets, "getSecrets should default to true")
}

// TestLoadConfig_InsecurePerms verifies that LoadRunnerConfig tightens the
// permissions of a runner config file that was deployed with loose (group-
// or world-readable) permissions, closing the attack surface where a task
// user could exfiltrate credentials (e.g. staticSecret) from the file.
func TestLoadConfig_InsecurePerms(t *testing.T) {
	cfgPath := copyTestConfigToTempFile(t, 0644)

	runnercfg, err := LoadRunnerConfig(cfgPath)
	require.NoError(t, err, "LoadRunnerConfig should tighten perms and succeed")
	assert.Equal(t, "ec2", runnercfg.Provider.ProviderType)

	// Verify the file is now private per the platform's semantics (0600 on
	// POSIX, owner-only ACL on Windows). A second call to MakeFilePrivate
	// should be a no-op, indicating the file is already private.
	wasLoose, err := perms.MakeFilePrivate(cfgPath)
	require.NoError(t, err)
	assert.False(t, wasLoose, "runner config file should already be private after LoadRunnerConfig")
}
