package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"

	"github.com/taskcluster/httpbackoff/v3"
	tcclient "github.com/taskcluster/taskcluster/v60/clients/client-go"
	"github.com/taskcluster/taskcluster/v60/clients/client-go/tcsecrets"
	"github.com/taskcluster/taskcluster/v60/workers/generic-worker/fileutil"
	"github.com/taskcluster/taskcluster/v60/workers/generic-worker/gwconfig"
)

// BootstrapConfig is the data structure used by generic-worker to provide
// elementary bootstrapping of the worker host environment dynamically on the
// worker's first run. The data is provided by Worker Manager
// (config.workerConfig property of worker pool).
//
// Since Worker Manager provides only a single JSON object for
// worker configuration, generic-worker interprets only the `genericWorker`
// property of this object, to allow other tools installed on the worker to store
// other information that they need in the same JSON object.
type BootstrapConfig struct {
	// GenericWorker could be defined as type PublicHostSetup, but then
	// we wouldn't have a way to call dec.DisallowUnknownFields() without also
	// affecting unpacking of UserData struct (which may have unknown fields).
	GenericWorker json.RawMessage `json:"genericWorker"`
}

// PublicHostSetup is the data structure that is passed into cloud metadata
// that originates in the worker pool definition. Since this data is included
// in the worker pool definition, it should not contain any secrets. For
// confidential information, see PrivateHostSetup struct.
type PublicHostSetup struct {
	// Non-confidential generic-worker config settings
	Config *gwconfig.PublicConfig `json:"config"`
	// Non-confidential static files to write to the host environment, that for
	// some reason are not already present in the AMI that this worker runs on.
	// Usually these should be set up on during the creation of the worker
	// AMIs.
	Files []fileutil.File `json:"files"`
}

// PrivateHostSetup is the data structure that is stored in the taskcluster
// secret worker-pool:<provisionerId>/<workerType>. This should be anything
// private/confidential, that should not be visible in the worker pool
// definition.
type PrivateHostSetup struct {
	// Confidential generic-worker config settings
	Config *gwconfig.PrivateConfig `json:"config"`
	// Confidential static files to write to the host environment, that are not
	// included in the AMI creation process (usually to keep the AMI public).
	Files []fileutil.File `json:"files"`
}

func Bootstrap(c *gwconfig.Config, workerConfig *BootstrapConfig, secretPrefix string) error {

	// these are just default values, will be overwritten if set in worker type config
	c.ShutdownMachineOnInternalError = true
	c.ShutdownMachineOnIdle = true

	// Parse the config before applying it, to ensure that no disallowed fields
	// are included.
	publicHostSetup, err := workerConfig.PublicHostSetup()
	if err != nil {
		return err
	}

	// Host setup per worker type "userData" section.
	//
	// Note, we first update configuration from public host setup, before
	// calling tc-secrets to get private host setup, in case secretsBaseURL is
	// configured in userdata.
	err = c.MergeInJSON(workerConfig.GenericWorker, func(a map[string]interface{}) map[string]interface{} {
		if config, exists := a["config"]; exists {
			return config.(map[string]interface{})
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("error applying /data/genericWorker/config from AWS userdata to config: %v", err)
	}

	// Fetch additional (secret) host setup from taskcluster-secrets service.
	// See: https://bugzil.la/1375200
	tcsec := serviceFactory.Secrets(c.Credentials(), c.RootURL)
	secretName := secretPrefix + ":" + c.ProvisionerID + "/" + c.WorkerType
	sec, err := tcsec.Get(secretName)
	if err != nil {
		// 404 error is ok, since secrets aren't required. Anything else indicates there was a problem retrieving
		// secret or talking to secrets service, so they should return an error
		if apiCallException, isAPICallException := err.(*tcclient.APICallException); isAPICallException {
			rootCause := apiCallException.RootCause
			if badHTTPResponseCode, isBadHTTPResponseCode := rootCause.(httpbackoff.BadHttpResponseCode); isBadHTTPResponseCode {
				if badHTTPResponseCode.HttpResponseCode == 404 {
					log.Printf("WARNING: No worker secrets for worker type %v - secret %v does not exist.", c.WorkerType, secretName)
					err = nil
					sec = &tcsecrets.Secret{
						Secret: json.RawMessage(`{}`),
					}
				}
			}
		}
	}
	if err != nil {
		return fmt.Errorf("error fetching secret %v from taskcluster-secrets service: %v", secretName, err)
	}
	b := bytes.NewBuffer([]byte(sec.Secret))
	d := json.NewDecoder(b)
	d.DisallowUnknownFields()
	var privateHostSetup PrivateHostSetup
	err = d.Decode(&privateHostSetup)
	if err != nil {
		return fmt.Errorf("error converting secret %v from taskcluster-secrets service into config/files: %v", secretName, err)
	}

	// Apply config from secret
	err = c.MergeInJSON(sec.Secret, func(a map[string]interface{}) map[string]interface{} {
		if config, exists := a["config"]; exists {
			return config.(map[string]interface{})
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("error applying config from secret %v to generic worker config: %v", secretName, err)
	}

	// Put files in place...
	for _, f := range append(publicHostSetup.Files, privateHostSetup.Files...) {
		err := f.Extract()
		if err != nil {
			return fmt.Errorf("error extracing file %v: %v", f.Path, err)
		}
	}
	if c.IdleTimeoutSecs == 0 {
		c.IdleTimeoutSecs = 3600
	}
	return nil
}

func (bootstrapConfig *BootstrapConfig) PublicHostSetup() (publicHostSetup *PublicHostSetup, err error) {
	if bootstrapConfig.GenericWorker == nil {
		return nil, fmt.Errorf("no genericWorker object defined in worker pool definition and no readable generic worker config file - cannot configure worker")
	}
	publicHostSetup = &PublicHostSetup{}
	b := bytes.NewBuffer([]byte(bootstrapConfig.GenericWorker))
	d := json.NewDecoder(b)
	d.DisallowUnknownFields()
	err = d.Decode(publicHostSetup)
	if err != nil {
		return nil, fmt.Errorf("public host setup %v cannot be decoded into PublicHostSetup object: %v", string(bootstrapConfig.GenericWorker), err)
	}
	if publicHostSetup.Config == nil {
		return nil, fmt.Errorf("no genericWorker.config object defined in worker pool definition and no readable generic worker config file - cannot configure worker: %v", string([]byte(bootstrapConfig.GenericWorker)))
	}
	return
}
