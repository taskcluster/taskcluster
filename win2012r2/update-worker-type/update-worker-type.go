package main

import (
	"errors"
	"fmt"
	"os"

	"github.com/taskcluster/taskcluster-client-go/awsprovisioner"
)

func main() {
	ami := os.Args[1]
	prov := awsprovisioner.New(os.Getenv("TASKCLUSTER_CLIENT_ID"), os.Getenv("TASKCLUSTER_ACCESS_TOKEN"))
	wt, _, err := prov.WorkerType("win2012r2")
	if err != nil {
		panic(err)
	}
	changed := false
	for _, r := range wt.Regions {
		if r.Region == "us-west-2" {
			r.LaunchSpec.ImageId = ami
			changed = true
		}
	}
	if !changed {
		panic(errors.New("Did not find ami region definition"))
	}
	updated := &awsprovisioner.CreateWorkerTypeRequest{
		CanUseOndemand: wt.CanUseOndemand,
		CanUseSpot:     wt.CanUseSpot,
		InstanceTypes:  wt.InstanceTypes,
		LaunchSpec:     wt.LaunchSpec,
		MaxCapacity:    wt.MaxCapacity,
		Secrets:        wt.Secrets,
	}
	_, _, err = prov.UpdateWorkerType("win2012r2", updated)
	if err != nil {
		panic(err)
	}
	fmt.Println("Worker type updated")
}
