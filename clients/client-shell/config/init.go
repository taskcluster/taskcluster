package config

import (
	"fmt"
	"os"

	"github.com/taskcluster/taskcluster/v96/clients/client-shell/client"
)

var (
	// Configuration contains the current configuration values.
	Configuration map[string]map[string]any

	// OptionsDefinitions is a map of all the OptionDefinitions, by command.
	OptionsDefinitions = make(map[string]map[string]OptionDefinition)

	// RootURL is the root URL for the desired Taskcluster deployment
	rootURL string

	// Credentials is the client credentials, if present.
	Credentials *client.Credentials
)

// Defer erroring out on a missing RootURL until we actually need one..
func RootURL() string {
	if rootURL == "" {
		fmt.Fprintln(os.Stderr, "No Root URL specified; set TASKCLUSTER_ROOT_URL")
		os.Exit(1)
	}
	return rootURL
}

// set the root URL -- this is used only for testing
func SetRootURL(newRootURL string) {
	rootURL = newRootURL
}

// Setup is to be called from main
// this was originally the init() function
// but we want to make sure all other packages have been initialized
// before calling them, which Load() does
func Setup() {
	var err error

	// load configuration
	Configuration, err = Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load configuration file, error: %s\n", err)
		os.Exit(1)
	}

	// load root URL
	rootURL = Configuration["config"]["rootUrl"].(string)

	// load credentials
	clientID := Configuration["config"]["clientId"].(string)
	accessToken := Configuration["config"]["accessToken"].(string)
	if clientID != "" && accessToken != "" {
		certificate, _ := Configuration["config"]["certificate"].(string)
		authorizedScopes, _ := Configuration["config"]["authorizedScopes"].([]string)
		Credentials = &client.Credentials{
			ClientID:         clientID,
			AccessToken:      accessToken,
			Certificate:      certificate,
			AuthorizedScopes: authorizedScopes,
		}
		return
	}
	if clientID != "" || accessToken != "" {
		fmt.Fprintln(os.Stderr, "Either ClientID or Access Token not set")
		os.Exit(1)
	}
}
