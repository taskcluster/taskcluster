package config

import (
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/bryanl/webbrowser"
	"github.com/taskcluster/taskcluster-cli/extpoints"
	graceful "gopkg.in/tylerb/graceful.v1"
)

type signin struct{}

func init() {
	extpoints.Register("signin", signin{})
}

func (signin) ConfigOptions() map[string]extpoints.ConfigOption {
	return map[string]extpoints.ConfigOption{
		"loginUrl": extpoints.ConfigOption{
			Description: "URL for the login service.",
			Default:     "https://login.taskcluster.net",
			Validate:    isString,
		},
	}
}

func (signin) Summary() string {
	return "Sign-in to get temporary credentials"
}

func (signin) Usage() string {
	usage := "Obtain temporary credentials from login.taskcluster.net\n"
	usage += "\n"
	usage += "Usage: taskcluster signin [--port <port>]\n"
	usage += "\n"
	usage += "Options:\n"
	usage += " -p, --port <port>  Port to use, defaults to random ephemeral port.\n"
	usage += "\n"
	usage += "The command `taskcluster signin` will open your web-browser to\n"
	usage += "login.taskcluster.net where you can sign-in and obtain temporary\n"
	usage += "credentials.\n"
	usage += "Once signed in, you can click the 'Grant Access' button which\n"
	usage += "will redirect you to localhost where this command will be listening\n"
	usage += "and save the temporary credentials to local configuration file.\n"
	return usage
}

func (signin) Execute(context extpoints.Context) bool {
	// Load configuration
	config, err := Load()
	if err != nil {
		fmt.Println("Failed to load configuration file, error: ", err)
		return false
	}

	fmt.Println("Starting")

	// Find port, choose 0 meaning random port, if none
	port := 0
	if p, ok := context.Arguments["--port"].(string); ok {
		pp, _ := strconv.ParseInt(p, 10, 16)
		port = int(pp)
	}

	// Setup server that we can shutdown gracefully
	s := graceful.Server{
		Timeout: 5 * time.Second,
		Server:  &http.Server{},
	}

	// Handle callback
	var serr error
	s.Server.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		qs := r.URL.Query()
		config["config"]["clientId"] = qs.Get("clientId")
		config["config"]["accessToken"] = qs.Get("accessToken")
		config["config"]["certificate"] = qs.Get("certificate")

		serr = Save(config)
		if serr != nil {
			fmt.Println("Failed to save configuration, error: ", serr)
		} else {
			fmt.Println("Credentials saved in configuration file.")
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
		fmt.Println("Failed to listen on localhost, error: ", err)
		return false
	}

	// Construct URL for login service and open it
	target := "http://" + strings.Replace(listener.Addr().String(), "127.0.0.1", "localhost", 1)
	description := url.QueryEscape(
		`Login and click the "Grant Access" button to transfer
		temporary credentials to the taskcluster CLI client`,
	)
	loginURL := context.Config["loginUrl"].(string)
	loginURL += "/?target=" + url.QueryEscape(target) + "&description=" + description

	// Open browser
	fmt.Println("Listening for a callback on: " + target)
	webbrowser.Open(loginURL, webbrowser.NewWindow, true)

	// Start serving
	s.Serve(listener)

	return serr == nil
}
