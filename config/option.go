package config

// A OptionDefinition is something with a default value and a validator.
// Only requirement is that values are JSON structures.
type OptionDefinition struct {
	Description string      // Description of the config option
	Default     interface{} // Default value
	Env         string      // Environment variable to attempt to load from (optional)
	Parse       bool        // True, if string input should be parsed as JSON
	Validate    func(value interface{}) error
}

// RegisterOptions takes in the name of the command and an map of OptionDefinition objects
func RegisterOptions(command string, options map[string]OptionDefinition) {
	if _, ok := OptionsDefinitions[command]; !ok {
		OptionsDefinitions[command] = make(map[string]OptionDefinition)
	}

	// we could just copy 'options' but sometimes there might already be other options
	for key, option := range options {
		OptionsDefinitions[command][key] = option
	}
}
