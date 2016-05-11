package main

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
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
		if strings.HasPrefix(name, "project/taskcluster/aws-provisioner-v1/worker-types/ssh-keys/") {
			workerType := name[61:]
			fmt.Printf("\nWorker type: %v\n", workerType)
			fmt.Println(strings.Repeat("=", len(workerType)+13))
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
				fmt.Printf("Region: %v\n", region)
				block, _ := pem.Decode([]byte(rsaKey.(string)))
				key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
				if err != nil {
					log.Fatalf("Could not interpret rsa key data '%v': '%v'", rsaKey, err)
				}
				svc := ec2.New(session.New(), &aws.Config{Region: aws.String(region)})
				inst, err := svc.DescribeInstances(
					&ec2.DescribeInstancesInput{
						Filters: []*ec2.Filter{
							&ec2.Filter{
								Name: aws.String("tag:WorkerType"),
								Values: []*string{
									aws.String(workerType),
								},
							},
						},
					},
				)
				if err != nil {
					log.Fatalf("Could not query AWS for instances in region %v for worker type %v: '%v'", region, workerType, err)
				}
				delimeter := ""
				for _, r := range inst.Reservations {
					for _, i := range r.Instances {
						fmt.Printf("  Base instance: %v\n", *i.InstanceId)
						p, err := svc.GetPasswordData(
							&ec2.GetPasswordDataInput{
								InstanceId: i.InstanceId,
							},
						)
						if err != nil {
							log.Fatalf("Could not query password for instance %v in region %v for worker type %v: '%v'", *i.InstanceId, region, workerType, err)
						}
						d, err := base64.StdEncoding.DecodeString(*p.PasswordData)
						if err != nil {
							log.Fatalf("Could not base64 decode encrypted password '%v': '%v'", *p.PasswordData, err)
						}
						b, err := rsa.DecryptPKCS1v15(
							nil,
							key,
							d,
						)
						if err != nil {
							log.Fatalf("Could not decrypt password for instance %v in region %v for worker type %v: '%v'", *i.InstanceId, region, workerType, err)
						}
						for _, ni := range i.NetworkInterfaces {
							fmt.Printf("    ssh Administrator@%v # (password: '%v')\n  --------------------------\n", *ni.Association.PublicIp, string(b))
						}
						inst, err := svc.DescribeInstances(
							&ec2.DescribeInstancesInput{
								Filters: []*ec2.Filter{
									&ec2.Filter{
										Name: aws.String("tag:WorkerType"),
										Values: []*string{
											aws.String("aws-provisioner-v1/" + workerType),
										},
									},
									&ec2.Filter{
										Name: aws.String("instance-state-name"),
										Values: []*string{
											aws.String("running"),
										},
									},
								},
							},
						)
						if err != nil {
							log.Fatalf("Could not query AWS for instances in region %v for worker type %v: '%v'", region, workerType, err)
						}
						for _, r := range inst.Reservations {
							for _, i := range r.Instances {
								delimeter = "  --------------------------\n"
								fmt.Printf("  Worker instance: %v\n", *i.InstanceId)
								for _, ni := range i.NetworkInterfaces {
									fmt.Printf("    ssh Administrator@%v # (password: '%v')\n", *ni.Association.PublicIp, string(b))
								}
							}
						}
					}
				}
				fmt.Print(delimeter)
			}
		}
	}
}
