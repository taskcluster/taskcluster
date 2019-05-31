package cfg

import "gopkg.in/yaml.v3"

// Config defines the configuration for taskcluster-worker-starter.
type Config struct {
	// The worker-manager providerType (and, by implication, cloud) controlling
	// this worker.
	ProviderType string `yaml:providerType`

	// Configuration settings to be merged into the worker.
	WorkerConfig map[string]interface{} `yaml:workerConfig`
}

func Load(filename []byte) error {
	var cfg Config
	var err = yaml.Unmarshal(filename, cfg)
	return err
}
