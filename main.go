package main

import (
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/docopt/docopt-go"
	"github.com/taskcluster/taskcluster-cli/config"
	"github.com/taskcluster/taskcluster-cli/extpoints"
	"github.com/taskcluster/taskcluster-cli/version"
)

func pad(s string, length int) string {
	p := length - len(s)
	if p < 0 {
		p = 0
	}
	return s + strings.Repeat(" ", p)
}

func availableCommands() string {
	usage := "Commands available:\n"
	providers := extpoints.CommandProviders()
	names := []string{}
	for name := range providers {
		names = append(names, name)
	}
	sort.Strings(names)
	maxNameLength := 0
	for _, name := range names {
		if len(name) > maxNameLength {
			maxNameLength = len(name)
		}
	}
	for _, name := range names {
		provider := providers[name]
		usage += "\n    " + pad(name, maxNameLength) + " " + provider.Summary()
	}
	usage += "\n"
	return usage
}

func main() {
	// Construct usage string
	usage := "Usage: taskcluster [options] <command> [<args>...]\n"
	usage += "\n"
	usage += availableCommands()
	usage += "\n"
	usage += "Options:\n"
	usage += "  --client-id <clientId>        ClientId [default: TASKCLUSTER_CLIENT_ID]\n"
	usage += "  --access-token <accessToken>  AccessToken [default: TASKCLUSTER_ACCESS_TOKEN]\n"
	usage += "  --certificate <certificate>   Certificate [default: TASKCLUSTER_CERTIFICATE]\n"
	usage += "\n"

	// Parse arguments
	arguments, _ := docopt.Parse(usage, nil, true, version.VersionNumber, true)
	cmd := arguments["<command>"].(string)
	args := arguments["<args>"].([]string)

	// Special case for handling "taskcluster help" ensuring it's the same as
	// "taskcluster --help". This should be the only special case necessary!
	if cmd == "help" && len(args) == 0 {
		fmt.Print(usage)
		return
	}

	// Find command provider
	providers := extpoints.CommandProviders()
	provider := providers[cmd]
	if provider == nil {
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", cmd)
		fmt.Fprintf(os.Stderr, usage)
		os.Exit(1)
	}

	// Parse args for command provider
	subArguments, _ := docopt.Parse(
		provider.Usage(), append([]string{cmd}, args...),
		true, version.VersionNumber, false,
	)

	// set up the whole config thing
	config.Setup()

	// Execute provider with parsed args
	success := provider.Execute(extpoints.Context{
		Arguments:   subArguments,
		Config:      config.Configuration[cmd],
		Credentials: config.Credentials,
	})

	if success {
		os.Exit(0)
	} else {
		os.Exit(1)
	}
}
