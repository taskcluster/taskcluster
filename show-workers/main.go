package main

import (
	"encoding/json"
	"log"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/ec2"
	"github.com/taskcluster/taskcluster-client-go/secrets"
	"github.com/taskcluster/taskcluster-client-go/tcclient"
)

func main() {
	tcCreds := &tcclient.Credentials{
		ClientId:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
		AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
		Certificate: os.Getenv("TASKCLUSTER_CERTIFICATE"),
	}
	mySecrets := secrets.New(tcCreds)
	s, _, err := mySecrets.List()
	if err != nil {
		log.Fatalf("Could not read secrets: '%v'", err)
	}
	for _, name := range s.Secrets {
		if strings.HasPrefix(name, "project/taskcluster/aws-provisioner-v1/") && strings.HasSuffix(name, "/ssh-keys") {
			workerType := name[39 : len(name)-9]
			log.Printf("Secret name: %v", name)
			secret, _, err := mySecrets.Get(name)
			if err != nil {
				log.Fatalf("Could not read secret %v: '%v'", name, err)
			}
			var data map[string]interface{}
			err = json.Unmarshal(secret.Secret, &data)
			if err != nil {
				log.Fatalf("Could not unmarshal data %v: '%v'", string(secret.Secret), err)
			}
			for region, rsaKey := range data {
				log.Printf("Worker Type: %v", workerType)
				log.Printf("Region:      %v", region)
				log.Printf("RSA Key:     %v", rsaKey)
				svc := ec2.New(session.New(), &aws.Config{Region: aws.String(region)})
				inst, err := svc.DescribeInstances(
					&ec2.DescribeInstancesInput{
						Filters: []*ec2.Filter{
							&ec2.Filter{
								Name: aws.String("tag-key"),
								Values: []*string{
									aws.String("WorkerType"),
								},
							},
							&ec2.Filter{
								Name: aws.String("tag-value"),
								Values: []*string{
									aws.String("aws-provisioner-v1/" + workerType),
								},
							},
						},
					},
				)
				if err != nil {
					log.Fatalf("Could not query AWS for instances in region %v for worker type %v: '%v'", region, workerType, err)
				}
				log.Printf("Instances: %#v", inst)
			}
		}
	}
}
