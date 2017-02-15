package config

import (
	"github.com/taskcluster/taskcluster-cli/extpoints"
)

// A OptionDefinition is something with a default value and a validator.
// Only requirement is that values are JSON structures.
type OptionDefinition struct {
	Description string      // Description of the config option
	Default     interface{} // Default value
	Env         string      // Environment variable to attempt to load from (optional)
	Parse       bool        // True, if string input should be parsed as JSON
	Validate    func(value interface{}) error
}

// RegisterConfigOption takes in the name of the command and an OptionDefinition object
func RegisterConfigOption(command string, options map[string]OptionDefinition) {
	if _, ok := OptionsDefinitions[command]; !ok {
		OptionsDefinitions[command] = make(map[string]OptionDefinition)
	}

	// we could just copy 'options' but sometimes there might already be other options
	for key, option := range options {
		OptionsDefinitions[command][key] = option
	}
}

// RegisterFromProvider registers the OptionsDefinitions from a CommandProvider.
// This is a function used for the "transition".
func RegisterFromProvider(command string, options map[string]extpoints.ConfigOption) {
	if _, exists := OptionsDefinitions[command]; !exists {
		OptionsDefinitions[command] = make(map[string]OptionDefinition)
	}

	for key, option := range options {
		// As of go1.8 (https://beta.golang.org/doc/go1.8#language), structs
		// that match can be implicitly converted :)
		OptionsDefinitions[command][key] = OptionDefinition(option)
	}
}
