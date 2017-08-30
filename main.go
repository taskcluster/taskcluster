package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"

	docopt "github.com/docopt/docopt-go"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/queue"
)

var version = "Taskcluster proxy 4.0.0"
var usage = `
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
    -t --task-id <taskId>           Restrict given scopes to those defined in taskId.
    --client-id <clientId>          Use a specific auth.taskcluster hawk client id [default: ].
    --access-token <accessToken>    Use a specific auth.taskcluster hawk access token [default: ].
    --certificate <certificate>     Use a specific auth.taskcluster hawk certificate [default: ].
`

func main() {
	// Parse the docopt string and exit on any error or help message.
	arguments, err := docopt.Parse(usage, nil, true, version, false, true)

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

	clientId := arguments["--client-id"]
	if clientId == nil || clientId == "" {
		clientId = os.Getenv("TASKCLUSTER_CLIENT_ID")
	}
	if clientId == "" {
		log.Fatal("Client ID must be passed via environment variable TASKCLUSTER_CLIENT_ID or command line option --client-id")
	}
	log.Printf("clientId: '%v'", clientId)

	accessToken := arguments["--access-token"]
	if accessToken == nil || accessToken == "" {
		accessToken = os.Getenv("TASKCLUSTER_ACCESS_TOKEN")
	}
	if accessToken == "" {
		log.Fatal("Access token must be passed via environment variable TASKCLUSTER_ACCESS_TOKEN or command line option --access-token")
	}
	log.Print("accessToken: <not shown>")

	certificate := arguments["--certificate"]
	if certificate == nil || certificate == "" {
		certificate = os.Getenv("TASKCLUSTER_CERTIFICATE")
	}

	if certificate == "" {
		log.Println("Warning - no taskcluster certificate set - assuming permanent credentials are being used")
	} else {
		log.Printf("certificate: '%v'", certificate)
	}

	creds := &tcclient.Credentials{
		ClientID:    clientId.(string),
		AccessToken: accessToken.(string),
		Certificate: certificate.(string),
	}

	if arguments["--task-id"] != nil {
		taskId := arguments["--task-id"].(string)
		log.Printf("taskId: '%v'", taskId)
		myQueue := queue.New(new(tcclient.Credentials))

		// Fetch the task to get the scopes we should be using...
		task, err := myQueue.Task(taskId)
		if err != nil {
			log.Fatalf("Could not fetch taskcluster task '%s' : %s", taskId, err)
		}

		creds.AuthorizedScopes = append(additionalScopes, task.Scopes...)
	}

	if len(creds.AuthorizedScopes) == 0 {
		creds.AuthorizedScopes = nil
		log.Print("Proxy has full scopes of provided credentials - no scope reduction being applied")
	} else {
		log.Println("Proxy with scopes: ", creds.AuthorizedScopes)
	}

	routes := Routes{
		Client: tcclient.Client{
			Authenticate: true,
			Credentials:  creds,
		},
	}

	http.HandleFunc("/bewit", routes.BewitHandler)
	http.HandleFunc("/credentials", routes.CredentialsHandler)
	http.HandleFunc("/", routes.RootHandler)

	startError := http.ListenAndServe(fmt.Sprintf(":%d", port), nil)
	if startError != nil {
		log.Fatal(startError)
	}
}
