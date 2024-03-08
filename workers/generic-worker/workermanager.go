package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	sysinfo "github.com/elastic/go-sysinfo"
	tcclient "github.com/taskcluster/taskcluster/v99/clients/client-go"
	"github.com/taskcluster/taskcluster/v99/clients/client-go/tcworkermanager"
	"github.com/taskcluster/taskcluster/v99/workers/generic-worker/graceful"
	"github.com/taskcluster/taskcluster/v99/workers/generic-worker/gwconfig"
)

type WorkerManagerUserData struct {
	WorkerPoolID string `json:"workerPoolId"`
	ProviderID   string `json:"providerId"`
	WorkerGroup  string `json:"workerGroup"`
	RootURL      string `json:"rootUrl"`
}

type Provider uint

const (
	NO_PROVIDER = iota
	AWS_PROVIDER
	AZURE_PROVIDER
	GCP_PROVIDER
	STATIC_PROVIDER
)

var (
	// registrationSecret is the secret from the most recent (re)registration,
	// needed for subsequent reregisterWorker calls.
	registrationSecret string

	// credentialsExpire is the time at which the current credentials expire.
	credentialsExpire time.Time

	// credRenewalStop is called to cancel the credential renewal goroutine.
	credRenewalStop func()
)

func (userData *WorkerManagerUserData) UpdateConfig(c *gwconfig.Config, providerType any) error {
	wp := strings.Split(userData.WorkerPoolID, "/")
	if len(wp) != 2 {
		return fmt.Errorf("was expecting WorkerPoolID to have syntax <provisionerId>/<workerType> but was %q", userData.WorkerPoolID)
	}

	c.ProvisionerID = wp[0]
	c.WorkerType = wp[1]
	c.WorkerGroup = userData.WorkerGroup
	c.RootURL = userData.RootURL

	// We need a worker manager client for fetching taskcluster credentials.
	// Ensure auth is disabled in client, since we don't have credentials yet.
	wm := serviceFactory.WorkerManager(nil, config.RootURL)

	workerIdentityProof, err := json.Marshal(providerType)
	if err != nil {
		return fmt.Errorf("could not marshal provider type %#v: %v", providerType, err)
	}

	regReq := &tcworkermanager.RegisterWorkerRequest{
		WorkerPoolID:        userData.WorkerPoolID,
		ProviderID:          userData.ProviderID,
		WorkerGroup:         userData.WorkerGroup,
		WorkerID:            c.WorkerID,
		WorkerIdentityProof: json.RawMessage(workerIdentityProof),
	}

	// Include system boot time if available
	if h, err := sysinfo.Host(); err == nil {
		regReq.SystemBootTime = tcclient.Time(h.Info().BootTime)
	} else {
		log.Printf("WARNING: could not get system boot time: %v", err)
	}

	reg, err := wm.RegisterWorker(regReq)

	if err != nil {
		return fmt.Errorf("could not register worker: %v", err)
	}

	c.AccessToken = reg.Credentials.AccessToken
	c.Certificate = reg.Credentials.Certificate
	c.ClientID = reg.Credentials.ClientID

	registrationSecret = reg.Secret
	credentialsExpire = time.Time(reg.Expires)

	var bootstrapConfig BootstrapConfig
	err = json.Unmarshal(reg.WorkerConfig, &bootstrapConfig)
	if err != nil {
		return fmt.Errorf("could not unmarshal worker config %v into bootstrap config: %v", string(reg.WorkerConfig), err)
	}

	return Bootstrap(c, &bootstrapConfig, "worker-pool")
}

// renewBeforeExpire calculates how long to wait before renewing credentials.
// It tries to renew 30 minutes before expiry for long-lived credentials,
// but waits at least 5 minutes after issuance. For very short-lived
// credentials, it renews 30 seconds before expiry.
func renewBeforeExpire(expires time.Duration) time.Duration {
	longSetback := 30 * time.Minute
	waitAtLeast := 5 * time.Minute
	minSetback := 30 * time.Second

	renew := expires - longSetback
	if renew < waitAtLeast {
		renew = waitAtLeast
		if renew > expires-minSetback {
			renew = max(expires-minSetback, 0)
		}
	}

	return renew
}

// startCredentialRenewal starts a background goroutine that renews worker
// credentials before they expire. If renewal fails, it triggers graceful
// termination so that tasks are resolved cleanly rather than failing
// mid-execution when credentials expire.
func startCredentialRenewal() func() {
	if credentialsExpire.IsZero() {
		log.Println("No credential expiry set; skipping credential renewal")
		return nil
	}

	untilExpire := time.Until(credentialsExpire)
	untilRenew := renewBeforeExpire(untilExpire)
	log.Printf("Worker credentials expire in %s; will renew in %s",
		untilExpire.Round(time.Second), untilRenew.Round(time.Second))

	done := make(chan struct{})
	go func() {
		// Use wall-clock time (not monotonic) so the timer survives VM
		// hibernation. time.After uses monotonic time, so we poll instead.
		renewAt := time.Now().Add(untilRenew).Round(0) // Round(0) strips monotonic
		for {
			select {
			case <-done:
				return
			case <-time.After(10 * time.Second):
				// Check wall clock, not monotonic
				if time.Now().Round(0).Before(renewAt) {
					continue
				}
			}

			log.Printf("Taskcluster credentials expire in %s; re-registering",
				time.Until(credentialsExpire).Round(time.Second))

			wm := serviceFactory.WorkerManager(config.Credentials(), config.RootURL)
			res, err := wm.ReregisterWorker(&tcworkermanager.ReregisterWorkerRequest{
				WorkerPoolID: config.ProvisionerID + "/" + config.WorkerType,
				WorkerGroup:  config.WorkerGroup,
				WorkerID:     config.WorkerID,
				Secret:       registrationSecret,
			})
			if err != nil {
				log.Printf("ERROR: could not re-register worker: %v", err)
				log.Println("Initiating graceful termination due to credential renewal failure")
				graceful.Terminate(false)
				return
			}

			config.UpdateCredentials(&tcclient.Credentials{
				ClientID:    res.Credentials.ClientID,
				AccessToken: res.Credentials.AccessToken,
				Certificate: res.Credentials.Certificate,
			})
			registrationSecret = res.Secret
			credentialsExpire = time.Time(res.Expires)

			// Schedule next renewal
			untilExpire = time.Until(credentialsExpire)
			untilRenew = renewBeforeExpire(untilExpire)
			renewAt = time.Now().Add(untilRenew).Round(0)
			log.Printf("Credentials renewed; next renewal in %s", untilRenew.Round(time.Second))
		}
	}()

	credRenewalStop = func() { close(done) }
	return credRenewalStop
}

// removeWorker attempts to unregister this worker from worker-manager,
// so that it is immediately marked as gone rather than waiting for timeout.
func removeWorker() {
	if !configureForAWS && !configureForGCP && !configureForAzure && !configureForStatic {
		// Only dynamically-provisioned workers should be removed
		return
	}
	log.Println("Removing worker from worker-manager")
	wm := serviceFactory.WorkerManager(config.Credentials(), config.RootURL)
	workerPoolID := config.ProvisionerID + "/" + config.WorkerType
	err := wm.RemoveWorker(workerPoolID, config.WorkerGroup, config.WorkerID)
	if err != nil {
		log.Printf("WARNING: could not remove worker: %v", err)
	}
}

// reportWorkerError reports an error to worker-manager, if credentials are
// available. This allows worker-manager to track and surface worker errors.
func reportWorkerError(description string, kind string, extra map[string]string) {
	if config == nil || config.ClientID == "" {
		return
	}
	wm := serviceFactory.WorkerManager(config.Credentials(), config.RootURL)
	workerPoolID := config.ProvisionerID + "/" + config.WorkerType

	extraJSON, err := json.Marshal(extra)
	if err != nil {
		log.Printf("WARNING: could not marshal error extra data: %v", err)
		extraJSON = []byte("{}")
	}

	_, err = wm.ReportWorkerError(workerPoolID, &tcworkermanager.WorkerErrorReport{
		Description: description,
		Kind:        kind,
		Title:       kind,
		Extra:       extraJSON,
		WorkerGroup: config.WorkerGroup,
		WorkerID:    config.WorkerID,
	})
	if err != nil {
		log.Printf("WARNING: could not report worker error: %v", err)
	}
}

func WMDeploymentID() (string, error) {
	log.Print("Checking if there is a new deploymentId...")
	wm := serviceFactory.WorkerManager(config.Credentials(), config.RootURL)
	wpfd, err := wm.WorkerPool(config.ProvisionerID + "/" + config.WorkerType)
	if err != nil {
		return "", fmt.Errorf("**** Can't reach worker-manager to see if there is a new deploymentId: %v", err)
	}
	workerManagerConfig := new(WorkerManagerConfig)
	err = json.Unmarshal(wpfd.Config, &workerManagerConfig)
	if err != nil {
		return "", errors.New("WARNING: can't decode /userData portion of worker type definition - probably somebody has botched a worker type update - not shutting down as in such a case, that would kill entire pool")
	}

	if len(workerManagerConfig.LaunchConfigs) < 1 {
		return "", errors.New("WARNING: No launchConfigs in worker pool configuration - probably somebody has botched a worker type update - not shutting down as in such a case, that would kill entire pool")
	}

	publicHostSetup, err := workerManagerConfig.LaunchConfigs[0].WorkerConfig.PublicHostSetup()
	if err != nil {
		return "", fmt.Errorf("WARNING: Can't extract public host setup from latest userdata for worker type %v - not shutting down as latest user data is probably botched: %v", config.WorkerType, err)
	}
	return publicHostSetup.Config.DeploymentID, nil
}

type WorkerManagerLaunchConfig struct {
	WorkerConfig BootstrapConfig `json:"workerConfig"`
}

type WorkerManagerConfig struct {
	LaunchConfigs []WorkerManagerLaunchConfig `json:"launchConfigs"`
}

// startTerminationPolling starts cloud-provider-specific termination polling
// based on which provider was used to configure the worker. Returns a stop
// function, or nil if no provider is active.
func startTerminationPolling() func() {
	switch {
	case configureForAWS:
		log.Println("Starting AWS spot termination polling")
		return startAWSTerminationPolling()
	case configureForGCP:
		log.Println("Starting GCP preemption polling")
		return startGCPTerminationPolling()
	case configureForAzure:
		log.Println("Starting Azure scheduled events polling")
		return startAzureTerminationPolling()
	default:
		return nil
	}
}
