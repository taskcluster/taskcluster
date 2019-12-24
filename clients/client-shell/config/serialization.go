package config

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"reflect"

	homedir "github.com/mitchellh/go-homedir"
	yaml "gopkg.in/yaml.v2"
)

// configFile is the location of the configuration file
func configFile() string {
	configFolder := os.Getenv("XDG_CONFIG_HOME")
	if configFolder == "" {
		homeFolder := os.Getenv("HOME")
		if homeFolder == "" {
			homeFolder, _ = homedir.Dir()
		}
		if homeFolder != "" {
			configFolder = filepath.Join(homeFolder, ".config")
		}
	}
	return filepath.Join(configFolder, "taskcluster.yml")
}

// Load will load configuration file, and initialize a default configuration
// if no configuration is present. This only returns an error if a configuration
// file is present, but we are unable to parse it.
func Load() (map[string]map[string]interface{}, error) {
	config := make(map[string]map[string]interface{})

	// Read config file and unmarshal into config overwriting default values
	// if ioutil.ReadFile returns an error, it means the config file couldn't
	// be found and we just skip
	configFile := configFile()
	if data, err := ioutil.ReadFile(configFile); err == nil {
		if err = yaml.Unmarshal(data, &config); err != nil {
			return nil, fmt.Errorf(
				"read config file %s, but failed to parse YAML, error: %s",
				configFile, err,
			)
		}
	}

	// Populate missing config fields with default values
	for command, options := range OptionsDefinitions {
		if _, ok := config[command]; !ok {
			config[command] = make(map[string]interface{})
		}

		for option, definition := range options {
			if _, ok := config[command][option]; !ok {
				config[command][option] = definition.Default
			}
		}
	}

	// Load values from environment variables when applicable
	for command, options := range OptionsDefinitions {
		for option, definition := range options {
			// if the definition does not specifies an env var, skip
			if definition.Env == "" {
				continue
			}

			// otherwise try to read from env var
			val := os.Getenv(definition.Env)
			if val == "" {
				continue
			}

			// parse value, if required
			var value interface{}
			if definition.Parse {
				if err := json.Unmarshal([]byte(val), &value); err != nil {
					return nil, fmt.Errorf(
						"failed to parse environment variable '%s' for config option '%s.%s', error: %s",
						definition.Env, command, option, err,
					)
				}
			} else {
				value = val
			}

			// validate value (so we can show an error messages showing where we got it)
			if definition.Validate != nil {
				if err := definition.Validate(value); err != nil {
					return nil, fmt.Errorf(
						"invalid value for config option '%s.%s' loaded from environment variable '%s', error: %s",
						command, option, definition.Env, err,
					)
				}
			}

			// store the value
			config[command][option] = value
		}
	}

	// Validate all values that have a validator and isn't the default value
	for command, options := range OptionsDefinitions {
		for option, definition := range options {
			value := config[command][option]

			// don't need to validate if it's the default value
			// or if there is no validator
			if definition.Validate == nil || reflect.DeepEqual(value, definition.Default) {
				continue
			}

			// otherwise validate
			if err := definition.Validate(value); err != nil {
				val, _ := json.Marshal(value)
				return nil, fmt.Errorf(
					"invalid value '%s' for config option '%s.%s', error: %s",
					val, command, option, err,
				)
			}
		}
	}

	return config, nil
}

// Save will save configuration.
func Save(config map[string]map[string]interface{}) error {
	result := make(map[string]map[string]interface{})

	// go over new object
	for name, options := range OptionsDefinitions {
		for key, option := range options {
			value := config[name][key]
			// Skip default values, no need to save those
			if reflect.DeepEqual(value, option.Default) {
				continue
			}

			// Validate if function is available
			if option.Validate != nil {
				if err := option.Validate(value); err != nil {
					val, _ := json.Marshal(value)
					return fmt.Errorf(
						"Invalid value '%s' for config key '%s.%s', error: %s",
						val, name, key, err,
					)
				}
			}

			// Ensure we have an object to save the key
			if result[name] == nil {
				result[name] = make(map[string]interface{})
			}

			// Save the config key
			result[name][key] = value
		}
	}

	// Serialize the config data
	data, err := yaml.Marshal(result)
	if err != nil {
		panic(fmt.Sprintf("Failed to serialize configFile, error: %s", err))
	}

	// Write config file
	configFile := configFile()
	// Attempt to create config folder if it doesn't exist... (ignore errors)
	_ = os.MkdirAll(filepath.Dir(configFile), 0664)
	if err = ioutil.WriteFile(configFile, data, 0664); err != nil {
		return fmt.Errorf("Failed to write config file: %s, error: %s", configFile, err)
	}

	return nil
}
