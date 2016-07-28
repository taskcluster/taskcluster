package extpoints

import "github.com/taskcluster/taskcluster-cli/client"

// A ConfigOption is something with a default value and a validator.
// Only requirement is that values are JSON structures.
type ConfigOption struct {
	Description string      // Description of the config option
	Default     interface{} // Default value
	Env         string      // Environment variable to attempt to load from (optional)
	Parse       bool        // True, if string input should be parsed as JSON
	Validate    func(value interface{}) error
}

// Context given to a CommandProvider.Execute
type Context struct {
	// Command line arguments parsed with docopt
	Arguments map[string]interface{}
	// Globally configured taskcluster credentials (nil, if none are available)
	Credentials *client.Credentials
	// Config keys matching declared ConfigOptions
	Config map[string]interface{}
}

// CommandProvider is implemented by anyone who wishes to provide a command line
// command that the cli should support.
type CommandProvider interface {
	// Config options supported by this CommandProvider
	ConfigOptions() map[string]ConfigOption
	// Summary returns a one-line description of what this command is for.
	Summary() string
	// Usage returns the docopt usage string, used to parse arguments.
	Usage() string
	// Execute is called with parsed docopt result in Context
	Execute(context Context) bool
}
