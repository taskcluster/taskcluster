package signin

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/bryanl/webbrowser"
	"github.com/spf13/cobra"
	"github.com/taskcluster/taskcluster-cli/cmds/root"
	"github.com/taskcluster/taskcluster-cli/config"
	graceful "gopkg.in/tylerb/graceful.v1"
)

func init() {
	cmd := &cobra.Command{
		Use:   "signin",
		Short: "Obtain temporary credentials from login.taskcluster.net.",
		Long: `The command 'taskcluster signin' will open your web-browser to
login.taskcluster.net where you can sign-in and obtain temporary
credentials.

Once signed in, you can click the 'Grant Access' button which
will redirect you to localhost where this command will be listening
and save the temporary credentials to local configuration file.`,
		RunE: cmdSignin,
	}
	cmd.Flags().IntP("port", "p", 0, "Port to use; defaults to random ephemeral port.")

	root.Command.AddCommand(cmd)

	config.RegisterOptions("signin", map[string]config.OptionDefinition{
		"loginUrl": config.OptionDefinition{
			Description: "URL for the login service.",
			Default:     "https://login.taskcluster.net",
			Validate:    func(value interface{}) error {
				if _, ok := value.(string); !ok {
					return errors.New("Must be a string")
				}
				return nil
			},
		},
	})
}

func cmdSignin(cmd *cobra.Command, _ []string) error {
	// Load configuration
	fmt.Fprintln(cmd.OutOrStdout(), "Starting")

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
		config.Configuration["config"]["clientId"] = qs.Get("clientId")
		config.Configuration["config"]["accessToken"] = qs.Get("accessToken")
		config.Configuration["config"]["certificate"] = qs.Get("certificate")

		serr = config.Save(config.Configuration)
		if serr == nil {
			fmt.Fprintln(cmd.OutOrStdout(), "Credentials saved in configuration file.")
		}

		title := "Successful"
		result := "You have successfully signed in."
		if serr != nil {
			title = "Failed"
			result = "Failed to save credentials!"
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`
			<!doctype html>
			<html>
				<head>
					<title>Sign-In ` + title + `</title>
					<script>
						// Close the window after 500ms
						setTimeout(function() {
							window.close();
						}, 500);
					</script>
				</head>
				<body>
					<h1>` + result + `.</h1>
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
	target := "http://" + strings.Replace(listener.Addr().String(), "127.0.0.1", "localhost", 1)
	description := url.QueryEscape(
		`Login and click the "Grant Access" button to transfer
		temporary credentials to the taskcluster CLI client`,
	)
	loginURL := config.Configuration["signin"]["loginUrl"].(string)
	loginURL += "/?target=" + url.QueryEscape(target) + "&description=" + description

	// Open browser
	fmt.Fprintln(cmd.OutOrStdout(), "Listening for a callback on: "+target)
	webbrowser.Open(loginURL, webbrowser.NewWindow, true)

	// Start serving
	s.Serve(listener)

	if serr != nil {
		return fmt.Errorf("failed to save configuration, error: %s", serr)
	}

	return nil
}
