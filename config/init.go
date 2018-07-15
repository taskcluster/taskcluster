package config

import (
	"fmt"
	"os"

	"github.com/taskcluster/taskcluster-cli/client"
)

var (
	// Configuration contains the current configuration values.
	Configuration map[string]map[string]interface{}

	// OptionsDefinitions is a map of all the OptionDefinitions, by command.
	OptionsDefinitions = make(map[string]map[string]OptionDefinition)

	// Credentials is the client credentials, if present.
	Credentials *client.Credentials
)

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

	// load credentials
	clientID, ok1 := Configuration["config"]["clientId"].(string)
	accessToken, ok2 := Configuration["config"]["accessToken"].(string)
	if ok1 && ok2 {
		certificate, _ := Configuration["config"]["certificate"].(string)
		authorizedScopes, _ := Configuration["config"]["authorizedScopes"].([]string)
		Credentials = &client.Credentials{
			ClientID:         clientID,
			AccessToken:      accessToken,
			Certificate:      certificate,
			AuthorizedScopes: authorizedScopes,
		}
	}
	if ok1 || ok2 {
		fmt.Fprintln(os.Stderr, "Either ClientID or Access Token not set")
		os.Exit(1)
	}
}
