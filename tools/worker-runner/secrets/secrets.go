package secrets

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"

	"github.com/taskcluster/httpbackoff/v3"
	tcclient "github.com/taskcluster/taskcluster/v50/clients/client-go"
	"github.com/taskcluster/taskcluster/v50/clients/client-go/tcsecrets"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/files"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/tc"
)

func clientFactory(rootURL string, credentials *tcclient.Credentials) (tc.Secrets, error) {
	return tcsecrets.New(credentials, rootURL), nil
}

func ConfigureRun(runnercfg *cfg.RunnerConfig, state *run.State) error {
	return configureRun(runnercfg, state, clientFactory)
}

func configureRun(runnercfg *cfg.RunnerConfig, state *run.State, secretsClientFactory tc.SecretsClientFactory) error {
	state.Lock()
	defer state.Unlock()

	secretsClient, err := secretsClientFactory(state.RootURL, &state.Credentials)
	if err != nil {
		return err
	}

	// Consult secrets named both `worker-type:..` and (preferred) `worker-pool:..`.
	found := false
	for _, prefix := range []string{"worker-type:", "worker-pool:"} {
		secretName := prefix + state.WorkerPoolID
		secResponse, err := secretsClient.Get(secretName)
		if err != nil {
			if apiCallException, isAPICallException := err.(*tcclient.APICallException); isAPICallException {
				rootCause := apiCallException.RootCause
				if badHTTPResponseCode, isBadHTTPResponseCode := rootCause.(httpbackoff.BadHttpResponseCode); isBadHTTPResponseCode {
					// 404 error is ok, since secrets aren't required. Anything
					// else indicates there was a problem retrieving secret or
					// talking to secrets service, so they should return an
					// error
					if badHTTPResponseCode.HttpResponseCode == 404 {
						continue
					}

					// and a 403 (insufficient scopes) is OK for the older
					// (worker-type) name, as worker-manager will eventually
					// stop providing scopes for it.
					if prefix == "worker-type:" && badHTTPResponseCode.HttpResponseCode == 403 {
						continue
					}
				}
			}
			return err
		}

		// some secrets contain raw configuration, while others contain the preferred {config: .., files: ..}.  If we have
		// something of the latter shape, we assume that's what we've got, and otherwise make itup
		var secret struct {
			Config *cfg.WorkerConfig `yaml:"config"`
			Files  []files.File      `yaml:"files"`
		}

		decoder := json.NewDecoder(bytes.NewReader(secResponse.Secret))
		decoder.DisallowUnknownFields()
		err = decoder.Decode(&secret)
		if err != nil {
			log.Printf("Falling back to legacy secret format without top-level config/files properties")
			err := json.Unmarshal(secResponse.Secret, &secret.Config)
			if err != nil {
				return fmt.Errorf("Secret value is not a JSON object")
			}
		}

		found = true
		state.WorkerConfig = state.WorkerConfig.Merge(secret.Config)

		if len(secret.Files) != 0 {
			return fmt.Errorf("secret files are nonempty - files are not supported yet")
		}
	}

	if !found {
		log.Printf("WARNING: No worker secrets for worker pool %v.", state.WorkerPoolID)
	}
	return nil
}
