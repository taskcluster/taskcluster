package config

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"reflect"

	homedir "github.com/mitchellh/go-homedir"
	"github.com/taskcluster/taskcluster-cli/extpoints"
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

// Load will load confiration file, and initialize a default configuration
// if no configuration is present. This only returns an error if a configuration
// file is present, but we are unable to parse it.
func Load() (map[string]map[string]interface{}, error) {
	config := make(map[string]map[string]interface{})

	// Load all the default values
	for name, provider := range extpoints.CommandProviders() {
		config[name] = make(map[string]interface{})
		for key, option := range provider.ConfigOptions() {
			config[name][key] = option.Default
		}
	}

	// Read config file and unmarshal into config overwriting default values
	if data, err := ioutil.ReadFile(configFile()); err == nil {
		if err = yaml.Unmarshal(data, &config); err != nil {
			return nil, fmt.Errorf(
				"Read config file %s, but failed to parse YAML, error: %s",
				configFile(), err,
			)
		}
	}

	// Load values from environment variables when applicable
	for name, provider := range extpoints.CommandProviders() {
		for key, option := range provider.ConfigOptions() {
			// Get from env var if possible and available
			if option.Env == "" {
				continue
			}
			val := os.Getenv(option.Env)
			if val == "" {
				continue
			}
			// Parse value, if required
			var value interface{}
			if option.Parse {
				if err := json.Unmarshal([]byte(val), &value); err != nil {
					return nil, fmt.Errorf(
						"Failed parse environment variable '%s' for config key '%s.%s', error: %s",
						option.Env, name, key, err,
					)
				}
			} else {
				value = val
			}
			// Validate value (so we can show an error messages showing where we got it)
			if option.Validate != nil {
				if err := option.Validate(value); err != nil {
					return nil, fmt.Errorf(
						"Invalid value for config key '%s.%s' loaded from environment variable '%s', error: %s",
						name, key, option.Env, err,
					)
				}
			}
			// Store the value
			config[name][key] = value
		}
	}

	// Validate all values that have a validator and isn't the default value
	for name, provider := range extpoints.CommandProviders() {
		for key, option := range provider.ConfigOptions() {
			value := config[name][key]
			if reflect.DeepEqual(value, option.Default) || option.Validate == nil {
				continue
			}
			if err := option.Validate(value); err != nil {
				val, _ := json.Marshal(value)
				return nil, fmt.Errorf(
					"Invalid value '%s' for config key '%s.%s', error: %s",
					val, name, key, err,
				)
			}
		}
	}

	return config, nil
}

// Save will save configuration.
func Save(config map[string]map[string]interface{}) error {
	result := make(map[string]map[string]interface{})

	for name, provider := range extpoints.CommandProviders() {
		for key, option := range provider.ConfigOptions() {
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
	if err = ioutil.WriteFile(configFile(), data, 0664); err != nil {
		return fmt.Errorf("Failed to write config file: %s, error: %s", configFile(), err)
	}

	return nil
}
