package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"os"
	"sort"
	"strings"

	"github.com/taskcluster/taskcluster-cli/extpoints"
	"github.com/taskcluster/taskcluster-client-go"
	"gopkg.in/yaml.v2"
)

type cfg struct{}

func init() {
	extpoints.Register("config", cfg{})
}

var isString = func(value interface{}) error {
	if _, ok := value.(string); !ok {
		return errors.New("Must be a string")
	}
	return nil
}

func pad(s string, length int) string {
	p := length - len(s)
	if p < 0 {
		p = 0
	}
	return s + strings.Repeat(" ", p)
}

func (cfg) ConfigOptions() map[string]extpoints.ConfigOption {
	return map[string]extpoints.ConfigOption{
		"clientId": extpoints.ConfigOption{
			Description: "ClientId to be used for authenticating requests",
			Default:     "",
			Env:         "TASKCLUSTER_CLIENT_ID",
			Validate:    isString,
		},
		"accessToken": extpoints.ConfigOption{
			Description: "AccessToken to be used for authenticating requests",
			Default:     "",
			Env:         "TASKCLUSTER_ACCESS_TOKEN",
			Validate:    isString,
		},
		"certificate": extpoints.ConfigOption{
			Description: "Certificate as required if using temporary credentials (must be given as string).",
			Default:     nil,
			Env:         "TASKCLUSTER_CERTIFICATE",
			Validate: func(value interface{}) error {
				s, ok := value.(string)
				if !ok {
					return errors.New("Must be a string containing certificate in JSON")
				}
				var cert tcclient.Certificate
				if err := json.Unmarshal([]byte(s), &cert); err != nil {
					return fmt.Errorf("Failed to parse JSON string, error: %s", err)
				}
				return nil
			},
		},
		"authorizedScopes": extpoints.ConfigOption{
			Description: `Set of scopes to be used for authorizing requests, defaults to all the scopes you have.`,
			Parse:       true,
			Validate: func(value interface{}) error {
				_, ok := value.([]string)
				if !ok {
					return errors.New("Must be a list of strings")
				}
				return nil
			},
		},
	}
}

func (cfg) Summary() string {
	return "Get/set taskcluster CLI configuration options"
}

func (cfg) Usage() string {
	usage := "Get/set taskcluster CLI configuration options.\n"
	usage += "\n"
	usage += "Usage:\n"
	usage += "  taskcluster config [options] [--output <file>]\n"
	usage += "  taskcluster config [options] get <key> [--output <file>]\n"
	usage += "  taskcluster config [options] set <key> <value> [--dry-run]\n"
	usage += "  taskcluster config [options] reset [<key>]\n"
	usage += "  taskcluster config help [<key>]\n"
	usage += "\n"
	usage += "Options:\n"
	usage += "  -o, --output <file>         Write output to file [default: -]\n"
	usage += "  -d, --dry-run               Validate option only, don't set it\n"
	usage += "  -f, --format (json | yaml)  Select output format [default: yaml]\n"
	usage += "\n"
	usage += "The configuration options for the taskcluster command line interface\n"
	usage += "is stored in:\n"
	usage += "    " + configFile() + "\n"
	usage += "The location can be modified with the environment variable\n"
	usage += "XDG_CONFIG_HOME.\n"
	return usage
}

func (cfg) Execute(context extpoints.Context) bool {
	argv := context.Arguments

	// Load configuration
	config, err := Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to load configuration file, error: %s\n", err)
		return false
	}

	// Parse key, find relevant configuration option, and current value
	var name string
	var key string
	var option *extpoints.ConfigOption
	var value interface{}
	if k, ok := argv["<key>"].(string); ok {
		// Parse the key
		parts := strings.SplitN(k, ".", 2)
		if k != "" && len(parts) != 2 {
			fmt.Fprintf(os.Stderr, "Invalid key format: '%s', configuration keys must be\n", k)
			fmt.Fprintf(os.Stderr, "on the form '<command>.<option>'.\n")
			return false
		}
		name = parts[0]
		key = parts[1]

		// Find command provider
		cmd := extpoints.CommandProviders()[name]
		if cmd == nil {
			fmt.Fprintf(os.Stderr, "Configuration key: '%s' references an unknown command: '%s'\n", k, name)
			return false
		}

		// Find config option
		options := cmd.ConfigOptions()
		if options != nil {
			if opt, ok := options[key]; ok {
				option = &opt
			}
		}

		// If no option was found, we print an error
		if option == nil {
			fmt.Fprintf(os.Stderr, "Configuration option: '%s' is not valid (no such option)\n", k)
			if options != nil {
				fmt.Fprintf(os.Stderr, "The command '%s' does support options:\n", name)
				maxLength := 0 // find max length for alignment
				for k := range options {
					if maxLength < len(k) {
						maxLength = len(k)
					}
				}
				for k, option := range options {
					fmt.Fprintf(os.Stderr, "  %s.%s %s\n", name, pad(k+":", maxLength), option.Description)
				}
			}
			return false
		}

		// Find value
		value = config[name][key]
	}

	if argv["help"].(bool) {
		if option != nil {
			// Print help for an option
			printOptionHelp(name, key, *option, value)
		} else {
			// Print list of options
			printHelp()
		}
	} else if argv["set"].(bool) {
		// Read value from stdin if necessary
		data := argv["<value>"].(string)
		if data == "-" {
			d, err := ioutil.ReadAll(os.Stdin)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Failed to read value from stdin, error: %s\n", err)
				return false
			}
			data = string(d)
		}

		// Parse value if necessary
		if option.Parse {
			err := json.Unmarshal([]byte(data), &value)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Failed to parse JSON value, error: %s\n", err)
				return false
			}
		} else {
			value = data
		}

		// Validate value
		if option.Validate != nil {
			if err := option.Validate(value); err != nil {
				fmt.Fprintf(os.Stderr, "Invalidate value, error: %s\n", err)
				return false
			}
		}

		// Save option
		if !argv["--dry-run"].(bool) {
			config[name][key] = value
			if err := Save(config); err != nil {
				fmt.Fprintf(os.Stderr, "Failed to save configuration file, error: %s\n", err)
				return false
			}
		}

		fmt.Fprintf(os.Stderr, "Set '%s.%s' = %s\n", key, name, data)
	} else if argv["reset"].(bool) {
		// Reset a specific option
		if option != nil {
			config[name][key] = option.Default
			fmt.Fprintf(os.Stderr, "Reset '%s.%s' to default value\n", name, key)
		} else {
			// Reset all options
			for name, provider := range extpoints.CommandProviders() {
				for key, option := range provider.ConfigOptions() {
					config[name][key] = option.Default
					fmt.Fprintf(os.Stderr, "Reset '%s.%s' to default value\n", name, key)
				}
			}
		}

		// Save configuration
		if err := Save(config); err != nil {
			fmt.Fprintf(os.Stderr, "Failed to save configuration file, error: %s\n", err)
			return false
		}

	} else {
		// Select formatter
		formatter := formatYAML
		if f, ok := argv["--format"].(string); ok {
			if f == "json" {
				formatter = formatJSON
			} else if f != "yaml" {
				fmt.Fprintf(os.Stderr, "Unsupported output format: %s\n", f)
				return false
			}
		}

		// Open output file
		out := io.Writer(os.Stdout)
		if o, ok := argv["--output"].(string); ok {
			if o != "-" {
				outFile, err := os.Create(o)
				if err != nil {
					fmt.Fprintf(os.Stderr, "Failed to create output file '%s' error: %s\n", o, err)
					return false
				}
				defer outFile.Close()
				out = outFile
			}
		}

		// Get all keys, if key was given
		if option == nil {
			value = config
		}

		// Write output
		if _, err := out.Write(formatter(value)); err != nil {
			fmt.Fprintf(os.Stderr, "Error writing result, error: %s\n", err)
			return false
		}
	}
	return true
}

func formatYAML(value interface{}) []byte {
	data, err := yaml.Marshal(value)
	if err != nil {
		panic(fmt.Sprintf("Internal error rendering yaml, error: %s", err))
	}
	return data
}

func formatJSON(value interface{}) []byte {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		panic(fmt.Sprintf("Internal error rendering json, error: %s", err))
	}
	return data
}

// printOptionHelp shows help for specific option
func printOptionHelp(name, key string, option extpoints.ConfigOption, value interface{}) {
	defaultValue := option.Default
	if option.Parse {
		if s, err := json.MarshalIndent(defaultValue, "  ", "  "); err == nil {
			defaultValue = "\n" + string(s)
		} else {
			defaultValue = fmt.Sprintf("%#v", defaultValue)
		}
		if s, err := json.MarshalIndent(value, "  ", "  "); err == nil {
			value = "\n" + string(s)
		} else {
			value = fmt.Sprintf("%#v", value)
		}
	}
	fmt.Printf("Key:     %s.%s\n", name, key)
	fmt.Println(option.Description)
	fmt.Printf("Value:   %s\n", value)
	fmt.Printf("Default: %s\n", defaultValue)
}

// printHelp as a list of all possible configuration options
func printHelp() {
	providers := extpoints.CommandProviders()
	names := []string{}
	for name := range providers {
		names = append(names, name)
	}
	sort.Strings(names)

	// Find max length
	maxLength := 0
	for name, provider := range providers {
		for key := range provider.ConfigOptions() {
			if len(name)+len(key) > maxLength {
				maxLength = len(name) + len(key)
			}
		}
	}

	fmt.Println("Configuration options:")
	for _, name := range names {
		provider := providers[name]
		for key, option := range provider.ConfigOptions() {
			fmt.Printf("  %s  %s\n", pad(name+"."+key+":", maxLength+2), option.Description)
		}
		// Add empty line between sections
		if len(provider.ConfigOptions()) > 0 {
			fmt.Println("")
		}
	}
}
