package configCmd

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/taskcluster/taskcluster/v93/clients/client-shell/config"
	"gopkg.in/yaml.v2"
)

// getOptionFromKey returns the command, option, definition, value of a config option
// this is the whole package, does everything
func getOptionFromKey(key string) (string, string, config.OptionDefinition, any, error) {
	command, option, err := parseKey(key)
	if err != nil {
		return "", "", config.OptionDefinition{}, "", err
	}

	definition, value, err := getOption(command, option)
	return command, option, definition, value, err
}

// parseKey parses a key into command, option
// use if you don't need to retrieve the definition
func parseKey(key string) (string, string, error) {
	parts := strings.SplitN(key, ".", 2)

	if len(parts) != 2 || len(parts[0]) == 0 || len(parts[1]) == 0 {
		return "", "", fmt.Errorf("invalid key format '%s', configuration keys must be on the form '<command>.<option>'", key)
	}

	return parts[0], parts[1], nil
}

// getOption retrieves the definition, value of a config option
// use if you don't need to parse the command and option
func getOption(command string, option string) (config.OptionDefinition, any, error) {
	// find map of options for specified command
	options, ok := config.OptionsDefinitions[command]
	if !ok {
		return config.OptionDefinition{}, "", fmt.Errorf("configuration key '%s.%s' references an unknown command '%s'", command, option, command)
	}

	// find specific option for that command
	definition, ok := options[option]
	if !ok {
		return config.OptionDefinition{}, "", fmt.Errorf("configuration option '%s' does not exist under command '%s'", option, command)
	}

	return definition, config.Configuration[command][option], nil
}

func pad(s string, length int) string {
	p := max(length-len(s), 0)
	return s + strings.Repeat(" ", p)
}

func formatYAML(value any) []byte {
	data, err := yaml.Marshal(value)
	if err != nil {
		panic(fmt.Sprintf("Internal error rendering yaml, error: %s", err))
	}
	return data
}

func formatJSON(value any) []byte {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		panic(fmt.Sprintf("Internal error rendering json, error: %s", err))
	}
	return data
}

func isString(value any) error {
	if _, ok := value.(string); !ok {
		return errors.New("must be a string")
	}
	return nil
}
