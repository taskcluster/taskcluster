package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/credentials"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/auth"
)

const BUCKET_NAME = "downloads-taskcluster-net"
const URL_PREFIX = "https://downloads.taskcluster.net"
const OBJECT_PREFIX = "taskcluster-cli/"

func getSTSCredentials() (id, secret, token string, err error) {
	creds := tcclient.Credentials{}
	client := auth.New(&creds)

	// if running in a task, use the taskcluster proxy
	if os.Getenv("TASK_ID") != "" {
		client.BaseURL = "http://taskcluster/auth/v1"
		log.Printf("Getting AWS credentials for %s/%s via taskcluster-proxy", BUCKET_NAME, OBJECT_PREFIX)
	} else {
		creds.ClientID = os.Getenv("TASKCLUSTER_CLIENT_ID")
		creds.AccessToken = os.Getenv("TASKCLUSTER_ACCESS_TOKEN")
		creds.Certificate = os.Getenv("TASKCLUSTER_CERTIFICATE")
		log.Printf("Getting AWS credentials for %s/%s with clientId %s",
			BUCKET_NAME, OBJECT_PREFIX, creds.ClientID)
	}

	resp, err := client.AwsS3Credentials("read-write", BUCKET_NAME, OBJECT_PREFIX, "")
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

func exitErrorf(msg string, args ...interface{}) {
	log.Printf(msg+"\n", args...)
	os.Exit(1)
}

func upload(svc *s3.S3, bucket string, folder string, filename string) (string, error) {
	file, err := os.Open(filename)
	if err != nil {
		return "", fmt.Errorf("opening %s: %s", filename, err)
	}
	defer file.Close()

	_, exeName := filepath.Split(filename)
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
	url := fmt.Sprintf("%s/%s", URL_PREFIX, key)
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

var version = flag.String("version", "", "release version")
var arch = flag.String("arch", "", "architecture")
var filename = flag.String("filename", "", "filename of the binary")

func main() {
	flag.Parse()
	if *version == "" || *arch == "" || *filename == "" {
		exitErrorf("Missing version, arch, or filename")
	}

	svc, err := getS3()
	if err != nil {
		exitErrorf("Unable to get service object, %v", err)
	}

	folder := fmt.Sprintf("%s%s/%s", OBJECT_PREFIX, *version, *arch)
	url, err := upload(svc, BUCKET_NAME, folder, *filename)
	if err != nil {
		exitErrorf("Unable to upload object: %s", err)
	}

	latestKey := fmt.Sprintf("%s%s/%s/taskcluster", OBJECT_PREFIX, "latest", *arch)
	err = redirect(svc, BUCKET_NAME, latestKey, url)
	if err != nil {
		exitErrorf("Unable to create redirect: %s", err)
	}
}
