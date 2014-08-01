package main

import (
	"fmt"
	docopt "github.com/docopt/docopt-go"
	tc "github.com/lightsofapollo/taskcluster-proxy/taskcluster"
	"log"
	"net/http"
	"os"
	"strconv"
)

var version = "Taskcluster proxy 1.0"
var usage = `
Taskcluster authentication proxy

  Usage:
    ./proxy [--access-token=woot --client-id=bar -p 8080] <taskId>
    ./proxy --help

  Options:
    -h --help                       Show this help screen.
    -p --port <port>                Port to bind the proxy server to [default: 8080].
    --client-id <clientId>          Use a specific auth.taskcluster hawk client id.
    --access-token <accessToken>    Use a specific auth.taskcluster hawk access token.
`

func main() {
	log.Println("%s", os.Args)
	// Parse the docopt string and exit on any error or help message.
	arguments, _ := docopt.Parse(usage, nil, true, version, false, true)

	taskId := arguments["<taskId>"].(string)
	port, err := strconv.Atoi(arguments["--port"].(string))

	if err != nil {
		log.Fatalf("Failed to convert port to integer")
	}

	clientId := arguments["--client-id"]
	if clientId == nil {
		clientId = os.Getenv("TASKCLUSTER_CLIENT_ID")
	}

	accessToken := arguments["--access-token"]
	if accessToken == nil {
		accessToken = os.Getenv("TASKCLUSTER_ACCESS_TOKEN")
	}

	// Ensure we have credentials our auth proxy is pretty much useless without
	// it.
	if accessToken == "" || clientId == "" {
		log.Fatalf(
			"Credentials must be passed via environment variables or flags...",
		)
	}

	// Fetch the task to get the scopes we should be using...
	task, err := tc.GetTask(taskId)

	if err != nil {
		log.Fatalf("Could not fetch taskcluster task '%s' : %s", taskId, err)
	}

	routes := Routes{
		Scopes:      task.Scopes,
		ClientId:    clientId.(string),
		AccessToken: accessToken.(string),
	}

	startError := http.ListenAndServe(fmt.Sprintf(":%d", port), routes)
	if startError != nil {
		log.Fatal(startError)
	}
}
