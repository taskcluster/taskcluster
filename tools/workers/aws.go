package main

import (
	"bytes"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"os"
	"strings"
	"sync"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/ec2"
)

func LogAWS(config json.RawMessage) {
	os.Stdout.Write([]byte(config))
	fmt.Println("")
}

func FetchWorkerPool(workerType, name string, out *bytes.Buffer) {
	out.WriteString(fmt.Sprintf("\nWorker type: %v\n", workerType))
	out.WriteString(strings.Repeat("=", len(workerType)+13) + "\n")
	var wg sync.WaitGroup
	regionBuffers := make([]*bytes.Buffer, len(data))
	c := 0
	for region, rsaKey := range data {
		regionBuffers[c] = &bytes.Buffer{}
		wg.Add(1)
		go func(region string, rsaKey interface{}, b *bytes.Buffer) {
			defer wg.Done()
			FetchRegion(workerType, region, rsaKey, b)
		}(region, rsaKey, regionBuffers[c])
		c++
	}
	wg.Wait()
	for _, b := range regionBuffers {
		out.WriteString(b.String())
	}
}

func FetchRegion(workerType string, region string, rsaKey interface{}, out *bytes.Buffer) {
	out.WriteString(fmt.Sprintf("Region: %v\n", region))
	block, _ := pem.Decode([]byte(rsaKey.(string)))
	key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		out.WriteString(fmt.Sprintf("Could not interpret rsa key data '%v': '%v'\n", rsaKey, err))
		return
	}
	sess, _ := session.NewSession()
	svc := ec2.New(sess, &aws.Config{Region: aws.String(region)})
	inst, err := svc.DescribeInstances(
		&ec2.DescribeInstancesInput{
			Filters: []*ec2.Filter{
				{
					Name: aws.String("tag:Name"),
					Values: []*string{
						aws.String(workerType + " base instance"),
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
		out.WriteString(fmt.Sprintf("Could not query AWS for instances in region %v for worker type %v: '%v'\n", region, workerType, err))
		return
	}
	delimeter := ""
	for _, r := range inst.Reservations {
		for _, i := range r.Instances {
			out.WriteString(fmt.Sprintf("  Base instance: %v\n", *i.InstanceId))
			p, err := svc.GetPasswordData(
				&ec2.GetPasswordDataInput{
					InstanceId: i.InstanceId,
				},
			)
			if err != nil {
				out.WriteString(fmt.Sprintf("Could not query password for instance %v in region %v for worker type %v: '%v'\n", *i.InstanceId, region, workerType, err))
				return
			}
			d, err := base64.StdEncoding.DecodeString(*p.PasswordData)
			if err != nil {
				out.WriteString(fmt.Sprintf("Could not base64 decode encrypted password '%v': '%v'\n", *p.PasswordData, err))
				return
			}
			b, err := rsa.DecryptPKCS1v15(
				nil,
				key,
				d,
			)
			if err != nil {
				out.WriteString(fmt.Sprintf("Could not decrypt password - probably somebody is rebuilding AMIs (key: %#v, encrypted password: %#v) for instance %v in region %v for worker type %v: '%v'", rsaKey, *p.PasswordData, *i.InstanceId, region, workerType, err))
				return
			}
			for _, ni := range i.NetworkInterfaces {
				if ni.Association != nil {
					out.WriteString(fmt.Sprintf("    ssh Administrator@%v # (password: '%v')\n  --------------------------\n", *ni.Association.PublicIp, string(b)))
				} else {
					out.WriteString(fmt.Sprintf("    ssh Administrator@X.X.X.X # (No IP address assigned - is instance running? password: '%v')\n  --------------------------\n", string(b)))
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
					out.WriteString(fmt.Sprintf("Could not query snapshot for volume %v on instance %v in region %v for worker type %v: '%v'\n", *bdm.Ebs.VolumeId, *i.InstanceId, region, workerType, err))
					return
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
						out.WriteString(fmt.Sprintf("Could not query images that use snapshot %v from volume %v on instance %v in region %v for worker type %v: '%v'\n", *snap.SnapshotId, *bdm.Ebs.VolumeId, *i.InstanceId, region, workerType, err))
						return
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
							out.WriteString(fmt.Sprintf("Could not query AWS for instances in region %v for worker type %v: '%v'\n", region, workerType, err))
							return
						}
						for _, r := range inst.Reservations {
							for _, i := range r.Instances {
								delimeter = "  --------------------------\n"
								out.WriteString(fmt.Sprintf("  Worker instance: %v (%v)\n", *i.InstanceId, *i.ImageId))
								for _, ni := range i.NetworkInterfaces {
									out.WriteString(fmt.Sprintf("    ssh Administrator@%v # (password: '%v')\n", *ni.Association.PublicIp, string(b)))
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
	out.WriteString(delimeter)
}
