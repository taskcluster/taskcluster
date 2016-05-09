package main

import (
	"errors"
	"fmt"
	"net/url"
	"os"

	"github.com/taskcluster/taskcluster-client-go/tcclient"
)

func main() {
	region := os.Args[1]
	newAmi := os.Args[2]
	workerType := os.Args[3]

	cd := &tcclient.ConnectionData{
		Credentials: &tcclient.Credentials{
			ClientId:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
			AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
			Certificate: os.Getenv("TASKCLUSTER_CERTIFICATE"),
		},
		BaseURL:      "https://aws-provisioner.taskcluster.net/v1",
		Authenticate: true,
	}
	var wt map[string]interface{}
	_, _, err := cd.APICall(nil, "GET", "/worker-type/"+url.QueryEscape(workerType), &wt, nil)
	if err != nil {
		panic(err)
	}
	found := false
	oldAmi := ""
	regions := wt["regions"].([]interface{})
	for i, _ := range regions {
		regionObj := regions[i].(map[string]interface{})
		if regionObj["region"] == region {
			launchSpec := regionObj["launchSpec"].(map[string]interface{})
			oldAmi = launchSpec["ImageId"].(string)
			launchSpec["ImageId"] = newAmi
			found = true
		}
	}
	if !found {
		panic(errors.New("Did not find ami region definition"))
	}
	fmt.Println("Old AMI: " + oldAmi)
	fmt.Println("New AMI: " + newAmi)
	if oldAmi == newAmi {
		fmt.Println("No change - exiting...")
		return
	}

	delete(wt, "lastModified")
	delete(wt, "workerType")
	_, _, err = cd.APICall(wt, "POST", "/worker-type/"+url.QueryEscape(workerType)+"/update", new(interface{}), nil)
	if err != nil {
		panic(err)
	}
	fmt.Println("Worker type " + workerType + " updated to use " + newAmi)
}
