package main

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"

	docopt "github.com/docopt/docopt-go"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/tcqueue"
)

var (
	version  = "4.1.1"
	revision = "" // this is set during build with `-ldflags "-X main.revision=$(git rev-parse HEAD)"`
	usage    = `
Taskcluster authentication proxy. By default this pulls all scopes from a
particular task but additional scopes may be added by specifying them after the
task id.

  Usage:
    taskcluster-proxy [options] [<scope>...]
    taskcluster-proxy -h|--help
    taskcluster-proxy --version

  Options:
    -h --help                       Show this help screen.
    --version                       Show the taskcluster-proxy version number.
    -p --port <port>                Port to bind the proxy server to [default: 8080].
    -i --ip-address <address>       IPv4 or IPv6 address of network interface to bind listener to.
                                    If not provided, will bind listener to all available network
                                    interfaces [default: ].
    -t --task-id <taskId>           Restrict given scopes to those defined in taskId.
    --root-url <rootUrl>            The rootUrl for the TC deployment to access
    --client-id <clientId>          Use a specific auth.taskcluster hawk client id [default: ].
    --access-token <accessToken>    Use a specific auth.taskcluster hawk access token [default: ].
    --certificate <certificate>     Use a specific auth.taskcluster hawk certificate [default: ].
`
)

func main() {
	routes, address, err := ParseCommandArgs(os.Args[1:], true)
	if err != nil {
		log.Fatalf("%v", err)
	}

	http.HandleFunc("/bewit", routes.BewitHandler)
	http.HandleFunc("/credentials", routes.CredentialsHandler)
	http.HandleFunc("/api", routes.APIHandler)
	http.HandleFunc("/", routes.RootHandler)

	// Only listen on loopback interface to reduce attack surface. If we later
	// wish to make this service available over the network, we could add
	// configuration settings for this, but for now, let's lock it down.
	startError := http.ListenAndServe(address, nil)
	if startError != nil {
		log.Fatal(startError)
	}
}

// ParseCommandArgs converts command line arguments into a configured Routes
// and port.
func ParseCommandArgs(argv []string, exit bool) (routes Routes, address string, err error) {
	fullversion := "Taskcluster proxy " + version
	if revision == "" {
		fullversion += " (unknown git revision)"
	} else {
		fullversion += " (git revision " + revision + ")"
	}
	log.Printf("Version: %v", fullversion)
	var arguments map[string]interface{}
	arguments, err = docopt.Parse(usage, argv, true, fullversion, false, exit)
	if err != nil {
		return
	}

	portStr := arguments["--port"].(string)
	var port int
	port, err = strconv.Atoi(portStr)
	if err != nil {
		return
	}

	if port < 0 || port > 65535 {
		err = fmt.Errorf("Port %v is not in range [0,65535]", port)
		return
	}

	ipAddress := arguments["--ip-address"].(string)
	if ipAddress != "" {
		if net.ParseIP(ipAddress) == nil {
			err = fmt.Errorf("Invalid IPv4/IPv6 address specified - cannot parse: %v", ipAddress)
			return
		}
	}
	address = ipAddress + ":" + portStr
	log.Printf("Listening on: %v", address)

	rootURL := arguments["--root-url"]
	if rootURL == nil || rootURL == "" {
		rootURL = os.Getenv("TASKCLUSTER_ROOT_URL")
	}
	if rootURL == "" {
		log.Fatal("Root URL must be passed via environment variable TASKCLUSTER_ROOT_URL or command line option --root-url")
	}
	log.Printf("Root URL: '%v'", rootURL)

	clientID := arguments["--client-id"]
	if clientID == nil || clientID == "" {
		clientID = os.Getenv("TASKCLUSTER_CLIENT_ID")
	}
	if clientID == "" {
		log.Fatal("Client ID must be passed via environment variable TASKCLUSTER_CLIENT_ID or command line option --client-id")
	}
	log.Printf("Client ID: '%v'", clientID)

	accessToken := arguments["--access-token"]
	if accessToken == nil || accessToken == "" {
		accessToken = os.Getenv("TASKCLUSTER_ACCESS_TOKEN")
	}
	if accessToken == "" {
		log.Fatal("Access token must be passed via environment variable TASKCLUSTER_ACCESS_TOKEN or command line option --access-token")
	}
	log.Print("Access Token: <not shown>")

	certificate := arguments["--certificate"]
	if certificate == nil || certificate == "" {
		certificate = os.Getenv("TASKCLUSTER_CERTIFICATE")
	}

	if certificate == "" {
		log.Println("Warning - no taskcluster certificate set - assuming permanent credentials are being used")
	} else {
		log.Printf("Certificate: '%v'", certificate)
	}

	// initially grant no scopes
	var authorizedScopes = []string{}

	if arguments["<scope>"] != nil {
		authorizedScopes = append(authorizedScopes, arguments["<scope>"].([]string)...)
	}

	if arguments["--task-id"] != nil {
		taskID := arguments["--task-id"].(string)
		log.Printf("taskId: '%v'", taskID)
		queue := tcqueue.New(nil)

		// Fetch the task to get the scopes we should be using...
		var task *tcqueue.TaskDefinitionResponse
		task, err = queue.Task(taskID)
		if err != nil {
			err = fmt.Errorf("Could not fetch taskcluster task '%s' : %s", taskID, err)
			return
		}

		authorizedScopes = append(authorizedScopes, task.Scopes...)
	}

	// if no --task-id specified, AND no scopes were specified, don't restrict AuthorizedScopes
	if arguments["--task-id"] == nil && len(authorizedScopes) == 0 {
		authorizedScopes = nil
	}

	// This will include rootURL in creds, once the client supports it; until then it had better be https://taskcluster.net
	if rootURL != "https://taskcluster.net" {
		err = fmt.Errorf("Only the legacy rootUrl is currently supported, not %s", rootURL)
		return
	}

	creds := &tcclient.Credentials{
		ClientID:         clientID.(string),
		AccessToken:      accessToken.(string),
		Certificate:      certificate.(string),
		AuthorizedScopes: authorizedScopes,
	}

	if authorizedScopes == nil {
		log.Print("Proxy has full scopes of provided credentials - no scope reduction being applied")
	} else {
		log.Println("Proxy with scopes: ", authorizedScopes)
	}

	routes = NewRoutes(
		rootURL.(string),
		tcclient.Client{
			Authenticate: true,
			Credentials:  creds,
		},
	)
	return
}
