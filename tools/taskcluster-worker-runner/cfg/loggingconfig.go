package cfg

import (
	"fmt"

	yaml "gopkg.in/yaml.v3"
)

// The configuration for logging. This must at least have "implementation",
// plus any additional provider-specific properties.
type LoggingConfig struct {
	Implementation string
	Data           map[string]interface{}
}

func (lc *LoggingConfig) UnmarshalYAML(node *yaml.Node) error {
	err := node.Decode(&lc.Data)
	if err != nil {
		return err
	}

	pt, ok := lc.Data["implementation"]
	if !ok {
		return fmt.Errorf("logging config must have a `implementation` property")
	}

	lc.Implementation, ok = pt.(string)
	if !ok {
		return fmt.Errorf("logging config's `implementation` property must be a string")
	}
	delete(lc.Data, "implementation")

	return nil
}
