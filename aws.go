package main

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"io/ioutil"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/taskcluster/generic-worker/gwconfig"
	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/taskcluster-client-go/tcawsprovisioner"
)

var (
	// not a const, because in testing we swap this out
	EC2MetadataBaseURL = "http://169.254.169.254/latest"
	// for querying deploymentId
	provisioner *tcawsprovisioner.AwsProvisioner
)

func queryUserData() (*UserData, error) {
	// http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html#instancedata-user-data-retrieval
	resp, _, err := httpbackoff.Get(EC2MetadataBaseURL + "/user-data")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	userData := new(UserData)
	decoder := json.NewDecoder(resp.Body)
	err = decoder.Decode(userData)
	return userData, err
}

func queryMetaData(url string) (string, error) {
	// http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html#instancedata-data-retrieval
	// call http://169.254.169.254/latest/meta-data/instance-id with httpbackoff
	resp, _, err := httpbackoff.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	content, err := ioutil.ReadAll(resp.Body)
	return string(content), err
}

// taken from https://github.com/taskcluster/aws-provisioner/blob/5a01a94141c38447968ec75232fd86a86cca366a/src/worker-type.js#L601-L615
type UserData struct {
	Data                interface{} `json:"data"`
	Capacity            int         `json:"capacity"`
	WorkerType          string      `json:"workerType"`
	ProvisionerID       string      `json:"provisionerId"`
	Region              string      `json:"region"`
	AvailabilityZone    string      `json:"availabilityZone"`
	InstanceType        string      `json:"instanceType"`
	SpotBid             float64     `json:"spotBid"`
	Price               float64     `json:"price"`
	LaunchSpecGenerated time.Time   `json:"launchSpecGenerated"`
	LastModified        time.Time   `json:"lastModified"`
	ProvisionerBaseURL  string      `json:"provisionerBaseUrl"`
	SecurityToken       string      `json:"securityToken"`
}

type Secrets struct {
	GenericWorker struct {
		Config json.RawMessage `json:"config"`
	} `json:"generic-worker"`
	Files []File `json:"files"`
}

type File struct {
	Description string `json:"description"`
	Path        string `json:"path"`
	Content     string `json:"content"`
	Encoding    string `json:"encoding"`
	Format      string `json:"format"`
}

func (f File) Extract() error {
	switch f.Format {
	case "file":
		return f.ExtractFile()
	case "zip":
		return f.ExtractZip()
	default:
		return errors.New("Unknown file format " + f.Format + " in worker type secret")
	}
}

func (f File) ExtractFile() error {
	switch f.Encoding {
	case "base64":
		data, err := base64.StdEncoding.DecodeString(f.Content)
		if err != nil {
			return err
		}
		log.Printf("Writing %v to path %v", f.Description, f.Path)
		return ioutil.WriteFile(f.Path, data, 0777)
	default:
		return errors.New("Unsupported encoding " + f.Encoding + " for file secret in worker type definition")
	}
}

func (f File) ExtractZip() error {
	switch f.Encoding {
	case "base64":
		data, err := base64.StdEncoding.DecodeString(f.Content)
		if err != nil {
			return err
		}
		log.Printf("Unzipping %v to path %v", f.Description, f.Path)
		return Unzip(data, f.Path)
	default:
		return errors.New("Unsupported encoding " + f.Encoding + " for zip secret in worker type definition")
	}
}

// This is a modified version of
// http://stackoverflow.com/questions/20357223/easy-way-to-unzip-file-with-golang
// to work with in memory zip, rather than a file
func Unzip(b []byte, dest string) error {
	br := bytes.NewReader(b)
	r, err := zip.NewReader(br, int64(len(b)))
	if err != nil {
		return err
	}

	os.MkdirAll(dest, 0755)

	// Closure to address file descriptors issue with all the deferred .Close() methods
	extractAndWriteFile := func(f *zip.File) error {
		rc, err := f.Open()
		if err != nil {
			return err
		}
		defer func() {
			if err := rc.Close(); err != nil {
				panic(err)
			}
		}()

		path := filepath.Join(dest, f.Name)

		if f.FileInfo().IsDir() {
			os.MkdirAll(path, f.Mode())
		} else {
			f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
			if err != nil {
				return err
			}
			defer func() {
				if err := f.Close(); err != nil {
					panic(err)
				}
			}()

			_, err = io.Copy(f, rc)
			if err != nil {
				return err
			}
		}
		return nil
	}

	for _, f := range r.File {
		err := extractAndWriteFile(f)
		if err != nil {
			return err
		}
	}

	return nil
}

func updateConfigWithAmazonSettings(c *gwconfig.Config) error {
	log.Print("Querying AWS Metadata to get default worker type config settings...")
	// these are just default values, will be overwritten if set in worker type config
	c.ShutdownMachineOnInternalError = true
	c.ShutdownMachineOnIdle = true

	userData, err := queryUserData()
	if err != nil {
		return err
	}
	c.ProvisionerID = userData.ProvisionerID
	c.Region = userData.Region
	c.ProvisionerBaseURL = userData.ProvisionerBaseURL

	awsprov := tcawsprovisioner.AwsProvisioner{
		Authenticate: false,
		BaseURL:      userData.ProvisionerBaseURL,
	}

	secToken, getErr := awsprov.GetSecret(userData.SecurityToken)
	// remove secrets even if we couldn't retrieve them!
	removeErr := awsprov.RemoveSecret(userData.SecurityToken)
	if getErr != nil {
		return getErr
	}
	if removeErr != nil {
		return removeErr
	}
	c.AccessToken = secToken.Credentials.AccessToken
	c.ClientID = secToken.Credentials.ClientID
	c.Certificate = secToken.Credentials.Certificate
	c.WorkerGroup = userData.Region
	c.WorkerType = userData.WorkerType

	awsMetadata := map[string]interface{}{}
	for _, url := range []string{
		EC2MetadataBaseURL + "/meta-data/ami-id",
		EC2MetadataBaseURL + "/meta-data/instance-id",
		EC2MetadataBaseURL + "/meta-data/instance-type",
		EC2MetadataBaseURL + "/meta-data/public-ipv4",
		EC2MetadataBaseURL + "/meta-data/placement/availability-zone",
		EC2MetadataBaseURL + "/meta-data/public-hostname",
		EC2MetadataBaseURL + "/meta-data/local-ipv4",
	} {
		key := url[strings.LastIndex(url, "/")+1:]
		value, err := queryMetaData(url)
		if err != nil {
			return err
		}
		awsMetadata[key] = value
	}
	c.WorkerTypeMetadata["aws"] = awsMetadata
	c.WorkerID = awsMetadata["instance-id"].(string)
	c.PublicIP = net.ParseIP(awsMetadata["public-ipv4"].(string))
	c.PrivateIP = net.ParseIP(awsMetadata["local-ipv4"].(string))
	c.InstanceID = awsMetadata["instance-id"].(string)
	c.InstanceType = awsMetadata["instance-type"].(string)
	c.AvailabilityZone = awsMetadata["availability-zone"].(string)

	secrets := new(Secrets)
	err = json.Unmarshal(secToken.Data, secrets)
	if err != nil {
		return err
	}

	// Now overlay existing config with values in secrets
	err = c.MergeInJSON([]byte(secrets.GenericWorker.Config))
	if err != nil {
		return err
	}

	// Now put secret files in place...
	for _, f := range secrets.Files {
		err := f.Extract()
		if err != nil {
			return err
		}
	}
	if c.IdleTimeoutSecs == 0 {
		c.IdleTimeoutSecs = 3600
	}
	return nil
}

func deploymentIDUpdated() bool {
	log.Print("Checking if there is a new deploymentId...")
	wtr, err := provisioner.WorkerType(config.WorkerType)
	if err != nil {
		// can't reach provisioner - let's assume the best, and just return
		log.Printf("**** Can't reach provisioner to see if there is a new deploymentId: %v", err)
		return false
	}
	secrets := new(Secrets)
	err = json.Unmarshal(wtr.Secrets, secrets)
	if err != nil {
		log.Printf("**** Can't unmarshal worker type secrets - probably somebody has botched a worker type update - not shutting down as in such a case, that would kill entire pool!")
		return false
	}
	c := new(gwconfig.Config)
	err = json.Unmarshal(secrets.GenericWorker.Config, c)
	if err != nil {
		log.Printf("**** Can't unmarshal config - probably somebody has botched a worker type update - not shutting down as in such a case, that would kill entire pool!")
		return false
	}
	if c.DeploymentID == config.DeploymentID {
		log.Printf("No change to deploymentId - %q == %q", config.DeploymentID, c.DeploymentID)
		return false
	}
	log.Printf("New deploymentId found! %q => %q - therefore shutting down!", config.DeploymentID, c.DeploymentID)
	return true
}

func handleWorkerShutdown(abort func()) func() {
	// Bug 1180187: poll this url every 5 seconds:
	// http://169.254.169.254/latest/meta-data/spot/termination-time
	ticker := time.NewTicker(time.Second * 5)
	go func() {
		for _ = range ticker.C {
			resp, err := http.Get(EC2MetadataBaseURL + "/meta-data/spot/termination-time")
			// intermittent errors calling this endpoint should be ignored, but can be logged
			if err != nil {
				log.Printf("WARNING: error when calling AWS EC2 spot termination endpoint: %v", err)
				continue
			}
			defer resp.Body.Close()
			if resp.StatusCode == 200 {
				abort()
				break
			}
			if resp.StatusCode != 404 {
				log.Printf("WARNING: Non 200/404 status code from spot termination endpoint: %v", resp.StatusCode)
			}
		}
	}()
	return ticker.Stop
}
