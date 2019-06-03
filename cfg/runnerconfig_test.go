package cfg

import (
	"path"
	"runtime"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestLoadConfig(t *testing.T) {
	_, sourceFilename, _, _ := runtime.Caller(0)
	testConfig := path.Join(path.Dir(sourceFilename), "test-config.yml")

	cfg, err := Load(testConfig)
	if err != nil {
		t.Fatalf("failed to load: %s", err)
	}

	assert.Equal(t, "ec2", cfg.Provider.ProviderType, "should read providerType correctly")
	assert.Equal(t, map[string]interface{}{"x": 10.0}, cfg.WorkerConfig.data, "should read workerConfig correctly")
}
