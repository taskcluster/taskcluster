//go:generate go-import-subtree .

package main

import (
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/docopt/docopt-go"
	"github.com/taskcluster/taskcluster-cli/client"
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
	// Load config file
	config, err := config.Load()
	if err != nil {
		fmt.Println("Failed to load configuration file, error: ", err)
		os.Exit(1)
	}

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
		fmt.Println("Unknown command: ", cmd)
		fmt.Print(usage)
		os.Exit(1)
	}

	// Parse args for command provider
	subArguments, _ := docopt.Parse(
		provider.Usage(), append([]string{cmd}, args...),
		true, version.VersionNumber, false,
	)

	// Create credentials, if available in configuration
	var credentials *client.Credentials
	clientID, ok1 := config["config"]["clientId"].(string)
	accessToken, ok2 := config["config"]["accessToken"].(string)
	if ok1 && ok2 {
		certificate, _ := config["config"]["certificate"].(string)
		authorizedScopes, _ := config["config"]["authorizedScopes"].([]string)
		credentials = &client.Credentials{
			ClientID:         clientID,
			AccessToken:      accessToken,
			Certificate:      certificate,
			AuthorizedScopes: authorizedScopes,
		}
	}

	// Execute provider with parsed args
	success := provider.Execute(extpoints.Context{
		Arguments:   subArguments,
		Config:      config[cmd],
		Credentials: credentials,
	})
	if success {
		os.Exit(0)
	} else {
		os.Exit(1)
	}
}
