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
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/secrets"
)

func main() {
	tcCreds := &tcclient.Credentials{
		ClientID:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
		AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
		Certificate: os.Getenv("TASKCLUSTER_CERTIFICATE"),
	}
	mySecrets := secrets.New(tcCreds)
	s, err := mySecrets.List()
	if err != nil {
		log.Fatalf("Could not read secrets: '%v'", err)
	}
	if len(s.Secrets) == 0 {
		log.Fatalf("Taskcluster secrets service returned zero secrets, but auth did not fail, so it seems your client (%v) does not have scopes\nfor getting existing secrets (recommended: \"secrets:get:project/taskcluster/aws-provisioner-v1/worker-types/ssh-keys/*\")", tcCreds.ClientID)
	}
	for _, name := range s.Secrets {
		if strings.HasPrefix(name, "project/taskcluster/aws-provisioner-v1/worker-types/ssh-keys/") {
			workerType := name[61:]
			fmt.Printf("\nWorker type: %v\n", workerType)
			fmt.Println(strings.Repeat("=", len(workerType)+13))
			secret, err := mySecrets.Get(name)
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
							{
								Name: aws.String("tag:WorkerType"),
								Values: []*string{
									aws.String("aws-provisioner-v1/" + workerType),
								},
							},
							{
								Name: aws.String("tag:TC-Windows-Base"),
								Values: []*string{
									aws.String("true"),
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
							log.Printf("Could not decrypt password - probably somebody is rebuilding AMIs and the keys in the secret store haven't been updated yet (key: %#v, encrpyted password: %#v) for instance %v in region %v for worker type %v: '%v'", rsaKey, *p.PasswordData, *i.InstanceId, region, workerType, err)
						}
						for _, ni := range i.NetworkInterfaces {
							if ni.Association != nil {
								fmt.Printf("    ssh Administrator@%v # (password: '%v')\n  --------------------------\n", *ni.Association.PublicIp, string(b))
							} else {
								fmt.Printf("    ssh Administrator@X.X.X.X # (No IP address assigned - is instance running? password: '%v')\n  --------------------------\n", string(b))
							}
						}

						for _, bdm := range i.BlockDeviceMappings {
							snapshots, err := svc.DescribeSnapshots(
								&ec2.DescribeSnapshotsInput{
									Filters: []*ec2.Filter{
										{
											Name: aws.String("volume-id"),
											Values: []*string{
												bdm.Ebs.VolumeId,
											},
										},
									},
								},
							)
							if err != nil {
								log.Fatalf("Could not query snapshot for volume %v on instance %v in region %v for worker type %v: '%v'", *bdm.Ebs.VolumeId, *i.InstanceId, region, workerType, err)
							}
							for _, snap := range snapshots.Snapshots {
								images, err := svc.DescribeImages(
									&ec2.DescribeImagesInput{
										Filters: []*ec2.Filter{
											{
												Name: aws.String("block-device-mapping.snapshot-id"),
												Values: []*string{
													snap.SnapshotId,
												},
											},
										},
									},
								)
								if err != nil {
									log.Fatalf("Could not query images that use snapshot %v from volume %v on instance %v in region %v for worker type %v: '%v'", *snap.SnapshotId, *bdm.Ebs.VolumeId, *i.InstanceId, region, workerType, err)
								}
								for _, image := range images.Images {
									inst, err := svc.DescribeInstances(
										&ec2.DescribeInstancesInput{
											Filters: []*ec2.Filter{
												{
													Name: aws.String("image-id"),
													Values: []*string{
														image.ImageId,
													},
												},
												{
													Name: aws.String("instance-state-name"),
													Values: []*string{
														aws.String("running"),
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
										log.Fatalf("Could not query AWS for instances in region %v for worker type %v: '%v'", region, workerType, err)
									}
									for _, r := range inst.Reservations {
										for _, i := range r.Instances {
											delimeter = "  --------------------------\n"
											fmt.Printf("  Worker instance: %v (%v)\n", *i.InstanceId, *i.ImageId)
											for _, ni := range i.NetworkInterfaces {
												fmt.Printf("    ssh Administrator@%v # (password: '%v')\n", *ni.Association.PublicIp, string(b))
											}
										}
									}
								}
							}
						}

						// aws ec2 --region us-west-2 describe-snapshots --filters "Name=volume-id,Values=vol-96e7d12f" --query 'Snapshots[*].SnapshotId' --output text
						// snap-a88dd3f0
						// aws ec2 --region us-west-2 describe-images --filters "Name=block-device-mapping.snapshot-id,Values=snap-a88dd3f0" --query 'Images[*].ImageId' --output text
						// ami-b00af7d0
						// aws ec2 --region us-west-2 describe-instances --filters 'Name=image-id,Values=ami-b00af7d0' --query 'Reservations[*].Instances[*].InstanceId' --output text
						// i-0027f0d020da43a95

					}
				}
				fmt.Print(delimeter)
			}
		}
	}
}
