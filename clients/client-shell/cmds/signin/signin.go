// Package signin implements the signin command.
package signin

import (
	"context"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/url"
	"os"
	"time"

	"github.com/gorilla/mux"
	"github.com/pkg/browser"
	"github.com/spf13/cobra"
	"github.com/taskcluster/slugid-go/slugid"
	libUrls "github.com/taskcluster/taskcluster-lib-urls"
	tcclient "github.com/taskcluster/taskcluster/v42/clients/client-go"
	"github.com/taskcluster/taskcluster/v42/clients/client-go/tcauth"
	"github.com/taskcluster/taskcluster/v42/clients/client-shell/cmds/root"
	"github.com/taskcluster/taskcluster/v42/clients/client-shell/config"
)

var log = root.Logger

func init() {
	cmd := &cobra.Command{
		Use:   "signin",
		Short: "Get Taskcluster credentials and export to the shell",
		Long: `The command 'taskcluster signin', run on a desktop system, will use
your browser to get Taskcluster credentials for use with other commands.

Use it like this:

$ eval ` + "`taskcluster signin`" + `

You might make this easy to use with a function in ~/.bashrc:

tc-signin() { eval ` + "`" + `taskcluster signin "${@}"` + "`" + `; }

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
}

func cmdSignin(cmd *cobra.Command, _ []string) error {
	if check, _ := cmd.Flags().GetBool("check"); check {
		return checkSignin()
	}

	// Load configuration
	log.Infoln("Starting")

	// Find port, choose 0 meaning random port, if none
	port, _ := cmd.Flags().GetInt("port")

	// Routes
	router := mux.NewRouter()

	router.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		qs := r.URL.Query()
		csh, _ := cmd.Flags().GetBool("csh")
		rootURL := config.RootURL()
		if csh {
			fmt.Fprintln(cmd.OutOrStdout(), "setenv TASKCLUSTER_CLIENT_ID '"+qs.Get("clientId")+"'")
			fmt.Fprintln(cmd.OutOrStdout(), "setenv TASKCLUSTER_ACCESS_TOKEN '"+qs.Get("accessToken")+"'")
			fmt.Fprintln(cmd.OutOrStdout(), "setenv TASKCLUSTER_ROOT_URL '"+rootURL+"'")
		} else {
			fmt.Fprintln(cmd.OutOrStdout(), "export TASKCLUSTER_CLIENT_ID='"+qs.Get("clientId")+"'")
			fmt.Fprintln(cmd.OutOrStdout(), "export TASKCLUSTER_ACCESS_TOKEN='"+qs.Get("accessToken")+"'")
			fmt.Fprintln(cmd.OutOrStdout(), "export TASKCLUSTER_ROOT_URL='"+rootURL+"'")
		}
		log.Infoln("Credentials output as environment variables")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`
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
	})

	// Construct URL for login service and open it
	callbackURL := "http://localhost"
	description := url.QueryEscape("Temporary client for use on the command line")
	name, _ := cmd.Flags().GetString("name")
	scopes, _ := cmd.Flags().GetStringArray("scope")
	expires, _ := cmd.Flags().GetString("expires")
	var loginURL string

	if config.RootURL() == "https://taskcluster.net" {
		loginURL += libUrls.UI(config.RootURL(), "/auth/clients/new")
	} else {
		loginURL += libUrls.UI(config.RootURL(), "/auth/clients/create")
	}

	for i := range scopes {
		if i == 0 {
			loginURL += "?"
		} else {
			loginURL += "&"
		}
		loginURL += "scope=" + url.QueryEscape(scopes[i])
	}

	loginURL += "&name=" + url.QueryEscape(name) + "-" + slugid.Nice()[0:6]
	loginURL += "&expires=" + url.QueryEscape(expires)
	loginURL += "&callback_url=" + url.QueryEscape(callbackURL)
	loginURL += "&description=" + description

	// Display URL to open
	log.Infoln("Listening for a callback on: " + callbackURL)
	log.Infoln("Opening URL: " + loginURL)

	// Discard whatever the browser dumps to stdout / stderr
	browser.Stderr = ioutil.Discard
	browser.Stdout = ioutil.Discard

	// Open browser
	err := browser.OpenURL(loginURL)
	if err != nil {
		return fmt.Errorf("failed to open browser, error: %s", err)
	}

	srv := &http.Server{
		Handler:      router,
		Addr:         fmt.Sprintf("%s:%d", callbackURL, port),
		WriteTimeout: 5 * time.Second,
		ReadTimeout:  5 * time.Second,
	}

	err = srv.ListenAndServe()
	if err != nil {
		return fmt.Errorf("failed to start localhost server, error: %s", err)
	}

	// Stop server
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)

	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		return fmt.Errorf("failed to shutdown localhost server, error: %s", err)
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
	auth := tcauth.New(creds, config.RootURL())
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
