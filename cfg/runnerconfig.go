package cfg

import (
	"io/ioutil"

	"gopkg.in/yaml.v3"
)

// RunnerConfig defines the configuration for taskcluster-worker-starter.  See the usage
// string for field descriptions
type RunnerConfig struct {
	Provider             ProviderConfig             `yaml:"provider"`
	WorkerImplementation WorkerImplementationConfig `yaml:"worker"`
	WorkerConfig         *WorkerConfig              `yaml:"workerConfig"`
	GetSecrets           bool                       `yaml:"getSecrets"`
	CacheOverRestarts    string                     `yaml:"cacheOverRestarts"`
}

// Load a configuration file
func LoadRunnerConfig(filename string) (*RunnerConfig, error) {
	data, err := ioutil.ReadFile(filename)
	if err != nil {
		return nil, err
	}
	var runnercfg RunnerConfig

	// set nonzero defaults
	runnercfg.GetSecrets = true

	err = yaml.Unmarshal(data, &runnercfg)
	if err != nil {
		return nil, err
	}
	return &runnercfg, nil
}
