package cfg

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/files"
)

// ProviderWorkerConfig handles the configuration format provided from
// worker-manager providers: `{<workerName>: {config, files}}`, including some
// compatibility translations described in the README.
type ProviderWorkerConfig struct {
	Config *WorkerConfig `json:"config,omitempty"`
	Files  []files.File  `json:"files,omitempty"`
}

// ParseProviderWorkerConfig takes a RawMessage representing the `workerConfig`
// field received from worker-manager, and returns the config and files it
// contains.  This requires the runnerConfig in order to determine the worker
// implementation name.
func ParseProviderWorkerConfig(runnercfg *RunnerConfig, body *json.RawMessage) (ProviderWorkerConfig, error) {
	var pwc ProviderWorkerConfig
	if body == nil {
		return pwc, nil
	}

	// calculate the camel-cased worker name
	implSnakeCase := runnercfg.WorkerImplementation.Implementation
	workerImpl := regexp.MustCompile("-[a-z]").ReplaceAllStringFunc(implSnakeCase, func(snake string) string { return strings.ToUpper(snake[1:]) })

	// the "correct" format, then, is a single-key dictionary with that key
	var bodyMap map[string]json.RawMessage
	err := json.Unmarshal(*body, &bodyMap)
	if err != nil {
		return pwc, fmt.Errorf("While parsing workerConfig from worker-manager: %s", err)
	}

	if len(bodyMap) == 1 {
		if inner, ok := bodyMap[workerImpl]; ok {
			err = json.Unmarshal(inner, &pwc)
			if err != nil {
				return pwc, fmt.Errorf("While parsing workerConfig from worker-manager: %s", err)
			}
			return pwc, nil
		}
	}

	// failing that, assume this is the deprecated "flat" form with configuration values at the top level
	pwc.Config = NewWorkerConfig()
	err = json.Unmarshal(*body, pwc.Config)
	if err != nil {
		return pwc, fmt.Errorf("While parsing workerConfig from worker-manager: %s", err)
	}

	return pwc, nil
}
