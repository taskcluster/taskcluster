package main

import (
	"errors"
	"fmt"
	"os"

	"github.com/taskcluster/taskcluster-client-go/awsprovisioner"
)

func main() {
	newAmi := os.Args[1]
	workerType := os.Args[2]
	prov := awsprovisioner.New(os.Getenv("TASKCLUSTER_CLIENT_ID"), os.Getenv("TASKCLUSTER_ACCESS_TOKEN"))
	wt, _, err := prov.WorkerType(workerType)
	if err != nil {
		panic(err)
	}
	found := false
	oldAmi := ""
	for i, _ := range wt.Regions {
		if wt.Regions[i].Region == "us-west-2" {
			oldAmi = wt.Regions[i].LaunchSpec.ImageId
			wt.Regions[i].LaunchSpec.ImageId = newAmi
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

	// Pretty ugly, but no easier way that I see to do this
	updated := &awsprovisioner.CreateWorkerTypeRequest{
		CanUseOndemand: wt.CanUseOndemand,
		CanUseSpot:     wt.CanUseSpot,
		InstanceTypes:  wt.InstanceTypes,
		LaunchSpec:     wt.LaunchSpec,
		MaxCapacity:    wt.MaxCapacity,
		MaxPrice:       wt.MaxPrice,
		MinCapacity:    wt.MinCapacity,
		MinPrice:       wt.MinPrice,
		Regions:        wt.Regions,
		ScalingRatio:   wt.ScalingRatio,
		Scopes:         wt.Scopes,
		Secrets:        wt.Secrets,
		UserData:       wt.UserData,
	}
	_, _, err = prov.UpdateWorkerType(workerType, updated)
	if err != nil {
		panic(err)
	}
	fmt.Println("Worker type " + workerType + " updated to use " + newAmi)
}
