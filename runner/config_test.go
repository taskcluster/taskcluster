package runner

import (
	"path"
	"runtime"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestLoadConfig(t *testing.T) {
	_, sourceFilename, _, _ := runtime.Caller(0)
	testConfig := path.Join(path.Dir(sourceFilename), "test-config.yml")

	runnercfg, err := Load(testConfig)
	if err != nil {
		t.Fatalf("failed to load: %s", err)
	}

	assert.Equal(t, "ec2", runnercfg.Provider.ProviderType, "should read providerType correctly")
	assert.Equal(t, 10.0, runnercfg.WorkerConfig.MustGet("x"), "should read workerConfig correctly")
}
