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
}

// Get a fragment of a usage message that describes the configuration file format
func Usage() string {
	return `
Configuration is in the form of a YAML file with the following fields:

	provider: (required) information about the provider for this worker

		providerType: (required) the worker-manager providerType responsible for this worker;
			this generally indicates the cloud the worker is running in, or 'static' for a
			non-cloud-based worker; see below.

	worker: (required) information about the worker being run

		implementation: (required) the name of the worker implementation

	workerConfig: arbitrary data which forms the basics of the config passed to the worker;
		this will be merged with several other sources of configuration.
`
}

// Load a configuration file
func Load(filename string) (*RunnerConfig, error) {
	data, err := ioutil.ReadFile(filename)
	if err != nil {
		return nil, err
	}
	var cfg RunnerConfig
	err = yaml.Unmarshal(data, &cfg)
	if err != nil {
		return nil, err
	}
	return &cfg, nil
}
