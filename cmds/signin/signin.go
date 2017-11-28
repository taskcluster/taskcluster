// Package signin implements the signin command.
package signin

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/pkg/browser"
	"github.com/spf13/cobra"
	"github.com/taskcluster/taskcluster-cli/cmds/root"
	"github.com/taskcluster/taskcluster-cli/config"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/auth"
	graceful "gopkg.in/tylerb/graceful.v1"
)

func init() {
	cmd := &cobra.Command{
		Use:   "signin",
		Short: "Get Taskcluster credentials and export to the shell",
		Long: `The command 'taskcluster signin', run on a desktop system, will use
your browser to get Taskcluster credentials for use with other commands.

Use it like this:

$ eval ` + "`taskcluster signin`" + `

You might make this easy to use with an alias in ~/.bashrc:

alias tc-signin="eval ` + "`taskcluster signin`" + `"

This will set environment variables in your shell session containing the credentials.
Note that the JS and Python client recognize the same environment variables, so any
tools using those libraries can also benefit from this signin method.`,

		RunE: cmdSignin,
	}
	cmd.Flags().Bool("check", false, "Check whether you are already signed in")
	cmd.Flags().Bool("csh", false, "Output csh-style environment variables (default is Bourne shell)")
	cmd.Flags().StringP("name", "n", "cli", "Name of the credential to create/reset.")
	cmd.Flags().String("expires", "1d", "Lifetime for this client (keep it short to avoid risk from accidental disclosure).")
	cmd.Flags().StringArrayP("scope", "s", []string{"*"}, "(can be repeated) Scopes for this client (limit this to avoid risk from accidental disclosure).")
	cmd.Flags().IntP("port", "p", 0, "Port to use; defaults to random ephemeral port.")

	root.Command.AddCommand(cmd)

	config.RegisterOptions("signin", map[string]config.OptionDefinition{
		"toolsUrl": config.OptionDefinition{
			Description: "URL for the tools service.",
			Default:     "https://tools.taskcluster.net",
			Validate: func(value interface{}) error {
				if _, ok := value.(string); !ok {
					return errors.New("Must be a string")
				}
				return nil
			},
		},
	})
}

func cmdSignin(cmd *cobra.Command, _ []string) error {
	if check, _ := cmd.Flags().GetBool("check"); check {
		return checkSignin()
	}

	// Load configuration
	fmt.Fprintln(cmd.OutOrStderr(), "Starting")

	// Find port, choose 0 meaning random port, if none
	port, _ := cmd.Flags().GetInt("port")

	// Setup server that we can shutdown gracefully
	s := graceful.Server{
		Timeout: 5 * time.Second,
		Server:  &http.Server{},
	}

	// Handle callback
	var serr error
	s.Server.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		qs := r.URL.Query()
		csh, _ := cmd.Flags().GetBool("csh")
		if csh {
			fmt.Fprintln(cmd.OutOrStdout(), "setenv TASKCLUSTER_CLIENT_ID '" + qs.Get("clientId") + "'")
			fmt.Fprintln(cmd.OutOrStdout(), "setenv TASKCLUSTER_ACCESS_TOKEN '" + qs.Get("accessToken") + "'")
		} else {
			fmt.Fprintln(cmd.OutOrStdout(), "export TASKCLUSTER_CLIENT_ID='" + qs.Get("clientId") + "'")
			fmt.Fprintln(cmd.OutOrStdout(), "export TASKCLUSTER_ACCESS_TOKEN='" + qs.Get("accessToken") + "'")
		}
		fmt.Fprintln(cmd.OutOrStderr(), "Credentials output as environment variables")

		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`
			<!doctype html>
			<html>
				<head>
					<title>Sign-In Successful</title>
				</head>
				<body>
					<h1>You have successfully signed in</h1>
					<p>You may now close this window.</p>
				</body>
			</html>
		`))
		s.Stop(50 * time.Millisecond)
	})

	// Start listening on localhost
	listener, err := net.ListenTCP("tcp", &net.TCPAddr{
		IP:   []byte{127, 0, 0, 1},
		Port: port,
	})
	if err != nil {
		return fmt.Errorf("failed to listen on localhost, error: %s", err)
	}

	// Construct URL for login service and open it
	callbackURL := "http://" + strings.Replace(listener.Addr().String(), "127.0.0.1", "localhost", 1)
	description := url.QueryEscape("Temporary client for use on the command line")
	loginURL := config.Configuration["signin"]["toolsUrl"].(string) + "/auth/clients/new";
	name, _ := cmd.Flags().GetString("name")
	loginURL += "?name=" + url.QueryEscape(name)
	loginURL += "&description=" + description
	scopes, _ := cmd.Flags().GetStringArray("scope")
	for i := range scopes {
		loginURL += "&scope=" + scopes[i]
	}
	expires, _ := cmd.Flags().GetString("expires")
	loginURL += "&expires=" + url.QueryEscape(expires)
	loginURL += "&callback_url=" + url.QueryEscape(callbackURL)

	// Open browser
	fmt.Fprintln(cmd.OutOrStderr(), "Listening for a callback on: "+callbackURL)
	fmt.Fprintln(cmd.OutOrStderr(), "Opening URL: "+loginURL)
	browser.OpenURL(loginURL)

	// Start serving
	s.Serve(listener)

	if serr != nil {
		return fmt.Errorf("failed to save configuration, error: %s", serr)
	}

	return nil
}

// Return an appropriate exit code based on whether we have credentials.
// Useful for shell scripting around 'taskcluster signin' calls.
func checkSignin() error {
	var creds *tcclient.Credentials
	if config.Credentials != nil {
		creds = config.Credentials.ToClientCredentials()
	}
	auth := auth.New(creds)
	result, err := auth.CurrentScopes()
	if err != nil {
		// Don't want an os.Exit() in case it causes scripting loops when used.
		return fmt.Errorf("failed to check credentials: %s", err)
	}
	if len(result.Scopes) == 0 {
		fmt.Println("No valid credentials were found")
		os.Exit(1)
	}
	return nil
}
