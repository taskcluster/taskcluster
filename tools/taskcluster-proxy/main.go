package main

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"

	docopt "github.com/docopt/docopt-go"
	tcclient "github.com/taskcluster/taskcluster/v96/clients/client-go"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v96/internal"
)

var (
	version  = internal.Version
	revision = "" // this is set during build with `-ldflags "-X main.revision=$(git rev-parse HEAD)"`
	usage    = `
Taskcluster authentication proxy. By default this pulls all scopes from a
particular task but additional scopes may be added by specifying them after the
task id.

  Usage:
    taskcluster-proxy [options] [<scope>...]
    taskcluster-proxy -h|--help
    taskcluster-proxy --version
    taskcluster-proxy --short-version

  Options:
    -h --help                       Show this help screen.
    --version                       Show the taskcluster-proxy version number.
    --short-version                 Show only the semantic version.
    -p --port <port>                Port to bind the proxy server to [default: 8080].
    -i --ip-address <address>       IPv4 or IPv6 address of network interface to bind listener to.
                                    If not provided, will bind listener to all available network
                                    interfaces [default: ].
    -t --task-id <taskId>           Restrict given scopes to those defined in taskId.
    --root-url <rootUrl>            The rootUrl for the TC deployment to access
    --client-id <clientId>          Use a specific auth.taskcluster hawk client id [default: ].
    --access-token <accessToken>    Use a specific auth.taskcluster hawk access token [default: ].
    --certificate <certificate>     Use a specific auth.taskcluster hawk certificate [default: ].
    --allowed-user <username>       Only allow connections from this OS user [default: ].
`
)

func main() {
	routes, address, allowedUser, err := ParseCommandArgs(os.Args[1:], true)
	if err != nil {
		log.Fatalf("%v", err)
	}

	verifier, err := newConnectionVerifier(allowedUser)
	if err != nil {
		log.Fatalf("Failed to create connection verifier: %v", err)
	}

	listener, err := net.Listen("tcp", address)
	if err != nil {
		log.Fatalf("Failed to listen on %s: %v", address, err)
	}

	wrappedListener := &verifiedListener{
		Listener: listener,
		verifier: verifier,
	}

	server := &http.Server{
		Handler: &routes,
	}

	startError := server.Serve(wrappedListener)
	if startError != nil {
		log.Fatal(startError)
	}
}

// Fetch a task by TaskID.  This is broken out to allow testing.
var getTask = func(rootURL string, taskID string) (task *tcqueue.TaskDefinitionResponse, err error) {
	queue := tcqueue.New(nil, rootURL)

	// Fetch the task to get the scopes we should be using...
	task, err = queue.Task(taskID)
	return
}

// ParseCommandArgs converts command line arguments into a configured Routes
// and port.
func ParseCommandArgs(argv []string, exit bool) (routes Routes, address string, allowedUser string, err error) {
	fullversion := "Taskcluster proxy " + version
	if revision != "" {
		fullversion += " (git revision " + revision + ")"
	}
	var arguments map[string]any
	arguments, err = docopt.ParseArgs(usage, argv, fullversion)
	if err != nil {
		return
	}

	if arguments["--short-version"].(bool) {
		fmt.Println(version)
		os.Exit(0)
	}

	log.Printf("Version: %v", fullversion)

	portStr := arguments["--port"].(string)
	var port int
	port, err = strconv.Atoi(portStr)
	if err != nil {
		return
	}

	if port < 0 || port > 65535 {
		err = fmt.Errorf("port %v is not in range [0,65535]", port)
		return
	}

	ipAddress := arguments["--ip-address"].(string)
	if ipAddress != "" {
		if net.ParseIP(ipAddress) == nil {
			err = fmt.Errorf("invalid IPv4/IPv6 address specified - cannot parse: %v", ipAddress)
			return
		}
	}
	address = ipAddress + ":" + portStr
	log.Printf("Listening on: %v", address)

	allowedUser = arguments["--allowed-user"].(string)
	if allowedUser != "" {
		log.Printf("Allowed user: %v", allowedUser)
	}

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

		// Fetch the task to get the scopes we should be using...
		var task *tcqueue.TaskDefinitionResponse
		task, err = getTask(rootURL.(string), taskID)
		if err != nil {
			err = fmt.Errorf("could not fetch taskcluster task '%s' : %s", taskID, err)
			return
		}

		authorizedScopes = append(authorizedScopes, task.Scopes...)
	}

	// if no --task-id specified, AND no scopes were specified, don't restrict AuthorizedScopes
	if arguments["--task-id"] == nil && len(authorizedScopes) == 0 {
		authorizedScopes = nil
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
		tcclient.Client{
			RootURL:      rootURL.(string),
			Authenticate: true,
			Credentials:  creds,
		},
	)
	return
}
