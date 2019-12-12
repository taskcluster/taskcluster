package cfg

import (
	"encoding/json"

	"github.com/taskcluster/taskcluster-worker-runner/files"
)

// ProviderWorkerConfig handles the configuration format provided from
// worker-manager providers: `{worker: {config, files}}`, including some
// compatibility translations described in the README.
type ProviderWorkerConfig struct {
	Config *WorkerConfig `json:"config,omitempty"`
	Files  []files.File  `json:"files,omitempty"`
}

type expectedConfig struct {
	Worker *struct {
		Config *WorkerConfig `json:"config"`
		Files  []files.File  `json:"files"`
	} `json:"worker"`
}

// compatibility with the old {genericWorker: {config, files}} format
type gwConfig struct {
	GenericWorker *struct {
		Config *WorkerConfig `json:"config"`
		Files  []files.File  `json:"files"`
	} `json:"genericWorker"`
}

func (pwc *ProviderWorkerConfig) UnmarshalJSON(b []byte) error {
	var expected = expectedConfig{}
	err := json.Unmarshal(b, &expected)
	if err == nil && expected.Worker != nil {
		pwc.Config = expected.Worker.Config
		pwc.Files = expected.Worker.Files
		return nil
	}

	// compatibility 1: genericWorker -> worker
	var gw = gwConfig{}
	err = json.Unmarshal(b, &gw)
	if err == nil && gw.GenericWorker != nil {
		pwc.Config = gw.GenericWorker.Config
		pwc.Files = gw.GenericWorker.Files
		return nil
	}

	// compatibility 2: flat form
	var config = WorkerConfig{}
	err = json.Unmarshal(b, &config)
	if err == nil {
		pwc.Config = &config
		pwc.Files = []files.File{}
		return nil
	}

	return err
}

func (pwc ProviderWorkerConfig) MarshalJSON() ([]byte, error) {
	rv := map[string]interface{}{
		"worker": map[string]interface{}{
			"config": pwc.Config,
			"files":  pwc.Files,
		},
	}
	return json.Marshal(rv)
}
