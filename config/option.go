package config

import (
    "github.com/taskcluster/taskcluster-cli/extpoints"
)

type ConfigOption struct {
	Description string      // Description of the config option
	Default     interface{} // Default value
	Env         string      // Environment variable to attempt to load from (optional)
	Parse       bool        // True, if string input should be parsed as JSON
	Validate    func(value interface{}) error
}

// Register takes in the name of the command and a ConfigOption object
func Register(command string, options map[string]ConfigOption) {
    if _, exists := ConfigOptions[command]; !exists {
        ConfigOptions[command] = make(map[string]ConfigOption)
    }

    // we could just copy 'options' but sometimes there might already be other options
    for key, option := range options {
        ConfigOptions[command][key] = option
    }
}

// To register the ConfigOptions from a CommandProvider
// this is a function used for the "transition"
func RegisterFromProvider(command string, options map[string]extpoints.ConfigOption) {
    if _, exists := ConfigOptions[command]; !exists {
        ConfigOptions[command] = make(map[string]ConfigOption)
    }

    for key, option := range options {
        ConfigOptions[command][key] = ConfigOption{
            Description: option.Description,
            Default:     option.Default,
            Env:         option.Env,
            Parse:       option.Parse,
            Validate:    option.Validate,
        }
    }
}
