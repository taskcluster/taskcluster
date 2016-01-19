package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"

	docopt "github.com/docopt/docopt-go"
	"github.com/taskcluster/taskcluster-client-go/queue"
	"github.com/taskcluster/taskcluster-client-go/tcclient"
)

var version = "Taskcluster proxy 3.0.0"
var usage = `
Taskcluster authentication proxy. By default this pulls all scopes from a
particular task but additional scopes may be added by specifying them after the
task id.

  Usage:
    taskcluster-proxy [options] <taskId> [<scope>...]
    taskcluster-proxy --help

  Options:
    -h --help                       Show this help screen.
    --version                       Show the taskcluster-proxy version number.
    -p --port <port>                Port to bind the proxy server to [default: 8080].
    --client-id <clientId>          Use a specific auth.taskcluster hawk client id [default: ].
    --access-token <accessToken>    Use a specific auth.taskcluster hawk access token [default: ].
    --certificate <certificate>     Use a specific auth.taskcluster hawk certificate [default: ].
`

func main() {
	// Parse the docopt string and exit on any error or help message.
	arguments, err := docopt.Parse(usage, nil, true, version, false, true)

	taskId := arguments["<taskId>"].(string)
	port, err := strconv.Atoi(arguments["--port"].(string))
	if err != nil {
		log.Fatalf("Failed to convert port to integer")
	}

	// Parse out additional scopes to add...
	var additionalScopes []string
	if arguments["<scope>"] != nil {
		additionalScopes = arguments["<scope>"].([]string)
	} else {
		additionalScopes = make([]string, 0)
	}

	// Client is is required but has a default.
	clientId := arguments["--client-id"]
	if clientId == nil || clientId == "" {
		clientId = os.Getenv("TASKCLUSTER_CLIENT_ID")
	}

	// Access token is also required but has a default.
	accessToken := arguments["--access-token"]
	if accessToken == nil || accessToken == "" {
		accessToken = os.Getenv("TASKCLUSTER_ACCESS_TOKEN")
	}

	certificate := arguments["--certificate"]
	if certificate == nil || certificate == "" {
		certificate = os.Getenv("TASKCLUSTER_CERTIFICATE")
	}

	log.Printf("clientId: '%v'\naccessToken: '%v'\ncertificate: '%v'\n", clientId, accessToken, certificate)

	// Ensure we have credentials our auth proxy is pretty much useless without
	// it.
	if accessToken == "" || clientId == "" {
		log.Fatalf(
			"Credentials must be passed via environment variables or flags...",
		)
	}

	if certificate == "" {
		log.Println("Warning - no taskcluster certificate set - assuming permanent credentials are being used")
	}

	creds := &tcclient.Credentials{
		ClientId:    clientId.(string),
		AccessToken: accessToken.(string),
		Certificate: certificate.(string),
	}

	myQueue := queue.New(creds)

	// Fetch the task to get the scopes we should be using...
	task, _, err := myQueue.Task(taskId)
	if err != nil {
		log.Fatalf("Could not fetch taskcluster task '%s' : %s", taskId, err)
	}

	creds.AuthorizedScopes = append(additionalScopes, task.Scopes...)

	log.Println("Proxy with scopes: ", creds.AuthorizedScopes)

	routes := Routes(tcclient.ConnectionData{
		Authenticate: true,
		Credentials:  creds,
	})

	startError := http.ListenAndServe(fmt.Sprintf(":%d", port), &routes)
	if startError != nil {
		log.Fatal(startError)
	}
}
