package cfg

import (
	"fmt"
	"log"

	"github.com/taskcluster/taskcluster/v100/tools/worker-runner/perms"
	"gopkg.in/yaml.v3"
)

// RunnerConfig defines the configuration for taskcluster-worker-starter.  See the usage
// string for field descriptions
type RunnerConfig struct {
	Provider             ProviderConfig             `yaml:"provider"`
	WorkerImplementation WorkerImplementationConfig `yaml:"worker"`
	WorkerConfig         *WorkerConfig              `yaml:"workerConfig"`
	Logging              *LoggingConfig             `yaml:"logging"`
	GetSecrets           bool                       `yaml:"getSecrets"`
	CacheOverRestarts    string                     `yaml:"cacheOverRestarts"`
}

// LoadRunnerConfig loads a worker-runner configuration file.
//
// The runner config may contain sensitive credentials (for example, the
// staticSecret used by the static provider to prove worker identity), so the
// file is tightened to owner-only permissions before being read. If the file
// had loose permissions on disk, a warning is logged so that operators can
// fix their provisioning; the worker continues to start because the immediate
// exposure has been closed.
func LoadRunnerConfig(filename string) (*RunnerConfig, error) {
	wasLoose, err := perms.MakeFilePrivate(filename)
	if err != nil {
		return nil, fmt.Errorf("cannot secure runner config file %s: %w", filename, err)
	}
	if wasLoose {
		log.Printf("WARNING: runner config file %s had insecure permissions and has been tightened to be readable only by its owner; please update your provisioning so the file is created privately", filename)
	}

	data, err := perms.ReadPrivateFile(filename)
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
