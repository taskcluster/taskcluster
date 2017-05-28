package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/ec2"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/secrets"
)

var mySecrets *secrets.Secrets

const secretsPrefix = "repo:github.com/mozilla-releng/OpenCloudConfig:"

var regions = []string{
	"us-east-1",
	"us-east-2",
	"us-west-1",
	"us-west-2",
	"eu-central-1",
}

type (
	RelOpsWorkerTypeSecret struct {
		Latest   AMISet   `json:"latest"`
		Previous []AMISet `json:"previous"`
	}
	AMISet struct {
		Timestamp time.Time              `json:"timestamp"`
		GitSHA    string                 `json:"git-sha"`
		AMIs      []AMI                  `json:"amis"`
		Users     map[string]Credentials `json:"users"`
	}
	AMI struct {
		Region string `json:"region"`
		ID     string `json:"ami-id"`
	}
	Credentials struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
)

func RelOpsPassword(region string, instance *ec2.Instance, s RelOpsWorkerTypeSecret) (credentials map[string]string, err error) {
	amiID := *instance.ImageId
	amiSetChecker := func(amiSet AMISet) (credentials map[string]string) {
		for _, ami := range amiSet.AMIs {
			if ami.Region == region && ami.ID == amiID {
				credentials = make(map[string]string, len(amiSet.Users))
				for _, c := range amiSet.Users {
					credentials[c.Username] = c.Password
				}
				return
			}
		}
		return
	}
	credentials = amiSetChecker(s.Latest)
	if len(credentials) > 0 {
		return
	}
	for _, amiSet := range s.Previous {
		credentials = amiSetChecker(amiSet)
		if len(credentials) > 0 {
			return
		}
	}
	return
}

func main() {
	tcCreds := &tcclient.Credentials{
		ClientID:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
		AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
		Certificate: os.Getenv("TASKCLUSTER_CERTIFICATE"),
	}
	mySecrets = secrets.New(tcCreds)
	s, err := mySecrets.List()
	if err != nil {
		log.Fatalf("Could not read secrets: '%v'", err)
	}
	if len(s.Secrets) == 0 {
		log.Fatalf("Taskcluster secrets service returned zero secrets, but auth did not fail, so it seems your client (%v) does not have scopes\nfor getting existing secrets (recommended: \"%v*\")", tcCreds.ClientID, secretsPrefix)
	}
	var wg sync.WaitGroup
	workerTypeBuffers := []*bytes.Buffer{}
	for _, name := range s.Secrets {
		if strings.HasPrefix(name, secretsPrefix) {
			wg.Add(1)
			b := &bytes.Buffer{}
			workerTypeBuffers = append(workerTypeBuffers, b)
			workerType := name[len(secretsPrefix):]
			go func(workerType, name string, b *bytes.Buffer) {
				defer wg.Done()
				fetchWorkerType(workerType, name, b)
			}(workerType, name, b)
		}
	}
	wg.Wait()
	for _, b := range workerTypeBuffers {
		fmt.Print(b.String())
	}
}

func fetchWorkerType(workerType, name string, out *bytes.Buffer) {
	out.WriteString(fmt.Sprintf("\nWorker type: %v\n", workerType))
	out.WriteString(strings.Repeat("=", len(workerType)+13) + "\n")
	secret, err := mySecrets.Get(name)
	if err != nil {
		out.WriteString(fmt.Sprintf("Could not read secret %v: '%v'\n", name, err))
		return
	}
	var data RelOpsWorkerTypeSecret
	err = json.Unmarshal(secret.Secret, &data)
	if err != nil {
		out.WriteString(fmt.Sprintf("Could not unmarshal data %v: '%v'\n", string(secret.Secret), err))
		return
	}
	var wg sync.WaitGroup
	regionBuffers := make([]*bytes.Buffer, len(regions), len(regions))
	c := 0
	for _, region := range regions {
		regionBuffers[c] = &bytes.Buffer{}
		wg.Add(1)
		go func(region string, b *bytes.Buffer) {
			defer wg.Done()
			fetchRegion(workerType, region, data, b)
		}(region, regionBuffers[c])
		c++
	}
	wg.Wait()
	for _, b := range regionBuffers {
		out.WriteString(b.String())
	}
}

func fetchRegion(workerType string, region string, secret RelOpsWorkerTypeSecret, out *bytes.Buffer) {
	out.WriteString(fmt.Sprintf("Region: %v\n", region))
	svc := ec2.New(session.New(), &aws.Config{Region: aws.String(region)})
	inst, err := svc.DescribeInstances(
		&ec2.DescribeInstancesInput{
			Filters: []*ec2.Filter{
				{
					Name: aws.String("tag:WorkerType"),
					Values: []*string{
						aws.String("aws-provisioner-v1/" + workerType),
					},
				},
				{
					Name: aws.String("tag:Owner"),
					Values: []*string{
						aws.String("aws-provisioner-v1"),
					},
				},
				{
					Name: aws.String("tag:Name"),
					Values: []*string{
						aws.String(workerType),
					},
				},
				// filter out terminated instances
				{
					Name: aws.String("instance-state-name"),
					Values: []*string{
						aws.String("pending"),
						aws.String("running"),
						aws.String("shutting-down"),
						aws.String("stopping"),
						aws.String("stopped"),
					},
				},
			},
		},
	)
	if err != nil {
		out.WriteString(fmt.Sprintf("Could not query AWS for instances in region %v for worker type %v: '%v'\n", region, workerType, err))
		return
	}
	delimeter := ""
	for _, r := range inst.Reservations {
		for _, i := range r.Instances {
			creds, err := RelOpsPassword(region, i, secret)
			if err != nil {
				out.WriteString(fmt.Sprintf("Could not find password"))
				return
			}
			for u, p := range creds {
				for _, ni := range i.NetworkInterfaces {
					if ni.Association != nil {
						out.WriteString(fmt.Sprintf("    %v: rdp %v@%v # (password: '%v')\n", *i.InstanceId, u, *ni.Association.PublicIp, p))
					} else {
						out.WriteString(fmt.Sprintf("    %v: rdp %v@X.X.X.X # (No IP address assigned - is instance running? password: '%v')\n", *i.InstanceId, u, p))
					}
				}
			}
		}
	}
	out.WriteString(delimeter)
}
