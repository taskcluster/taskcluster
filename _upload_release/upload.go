package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/credentials"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/auth"
)

const (
	bucketName   = "downloads-taskcluster-net"
	urlPrefix    = "https://downloads.taskcluster.net"
	objectPrefix = "taskcluster-cli/"
)

func getSTSCredentials() (id, secret, token string, err error) {
	creds := tcclient.Credentials{}
	client := auth.New(&creds)

	// if running in a task, use the taskcluster proxy
	if os.Getenv("TASK_ID") != "" {
		client.BaseURL = "http://taskcluster/auth/v1"
		log.Printf("Getting AWS credentials for %s/%s via taskcluster-proxy", bucketName, objectPrefix)
	} else {
		creds.ClientID = os.Getenv("TASKCLUSTER_CLIENT_ID")
		creds.AccessToken = os.Getenv("TASKCLUSTER_ACCESS_TOKEN")
		creds.Certificate = os.Getenv("TASKCLUSTER_CERTIFICATE")
		log.Printf("Getting AWS credentials for %s/%s with clientId %s",
			bucketName, objectPrefix, creds.ClientID)
	}

	resp, err := client.AwsS3Credentials("read-write", bucketName, objectPrefix, "")
	if err != nil {
		return "", "", "", err
	}
	log.Printf("Got AWS credentials, accessKeyId %s", resp.Credentials.AccessKeyID)
	return resp.Credentials.AccessKeyID,
		resp.Credentials.SecretAccessKey,
		resp.Credentials.SessionToken,
		nil
}

func getS3() (*s3.S3, error) {
	id, secret, token, err := getSTSCredentials()
	if err != nil {
		return nil, err
	}

	creds := credentials.NewStaticCredentials(id, secret, token)
	sess := session.Must(session.NewSession(aws.NewConfig().
		WithRegion("us-west-1").
		WithCredentials(creds)))

	return s3.New(sess), nil
}

func upload(svc *s3.S3, bucket, folder, exeName, filename string) (string, error) {
	file, err := os.Open(filename)
	if err != nil {
		return "", fmt.Errorf("opening %s: %s", filename, err)
	}
	defer file.Close()

	key := filepath.Join(folder, exeName)

	params := &s3.PutObjectInput{
		Bucket:             aws.String(bucket),
		Key:                aws.String(key),
		ContentDisposition: aws.String("attachment; filename=" + exeName),
		CacheControl:       aws.String("s-maxage=86400"), // one day
		Body:               file,
	}
	resp, err := svc.PutObject(params)

	if err != nil {
		return "", fmt.Errorf("calling PutObject for %s: %s", key, err)
	}

	// Pretty-print the response data.
	url := fmt.Sprintf("%s/%s", urlPrefix, key)
	log.Printf("Uploaded %s to %s with ETag %s", filename, url, *resp.ETag)
	return url, nil
}

func redirect(svc *s3.S3, bucket string, key string, target string) error {
	params := &s3.PutObjectInput{
		Bucket:                  aws.String(bucket),
		Key:                     aws.String(key),
		CacheControl:            aws.String("no-cache, no-store, must-revalidate"),
		WebsiteRedirectLocation: aws.String(target),
	}
	_, err := svc.PutObject(params)

	if err != nil {
		return fmt.Errorf("calling PutObject for %s: %s", key, err)
	}

	log.Printf("Created redirect from %s to %s", key, target)
	return nil
}

var (
	version    = flag.String("version", "", "release version")
	binaryName = flag.String("name", "taskcluster", "binary name")
)

func main() {
	flag.Parse()
	args := flag.Args()
	if *version == "" || *binaryName == "" || len(args) == 0 {
		log.Fatalf("Missing version, name, or filename(s)")
	}

	svc, err := getS3()
	if err != nil {
		log.Fatalf("Unable to get service object, %v", err)
	}

	formatRegexp := regexp.MustCompile(`^.*/` + *binaryName + `-(?P<osarch>(?P<os>[^-]+)-(?P<arch>[^-]+?))(?P<suffix>\..*)?$`)
	names := formatRegexp.SubexpNames()
	for _, filename := range args {
		sm := formatRegexp.FindStringSubmatch(filename)
		if sm == nil {
			continue
		}
		subMatches := map[string]string{}
		for i, m := range sm {
			subMatches[names[i]] = m
		}
		folder := fmt.Sprintf("%s%s/%s", objectPrefix, *version, subMatches["osarch"])
		url, err := upload(svc, bucketName, folder, *binaryName+subMatches["suffix"], filename)
		if err != nil {
			log.Fatalf("Unable to upload object: %s", err)
		}

		latestKey := fmt.Sprintf("%s%s/%s/%s", objectPrefix, "latest", subMatches["osarch"], *binaryName)
		err = redirect(svc, bucketName, latestKey, url)
		if err != nil {
			log.Fatalf("Unable to create redirect: %s", err)
		}
		log.Printf("Uploaded %s (%s) %s", *binaryName, *version, subMatches["osarch"])
	}
}
