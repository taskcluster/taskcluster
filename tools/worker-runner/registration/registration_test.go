package registration

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/Flaque/filet"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	tcclient "github.com/taskcluster/taskcluster/v50/clients/client-go"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/tc"
	"github.com/taskcluster/taskcluster/v50/tools/workerproto"
	ptesting "github.com/taskcluster/taskcluster/v50/tools/workerproto/testing"
)

func TestRegisterWorker(t *testing.T) {
	state := run.State{
		WorkerPoolID: "wp/id",
		ProviderID:   "prov",
		WorkerGroup:  "wg",
		WorkerID:     "wid",
	}
	runnercfg := cfg.RunnerConfig{}
	runnercfg.WorkerImplementation.Implementation = "whatever-worker"
	reg := new(&runnercfg, &state, tc.FakeWorkerManagerClientFactory)

	proof := map[string]interface{}{
		"because": "I said so",
	}

	expires := tcclient.Time(time.Now())
	tc.SetFakeWorkerManagerWorkerExpires(expires)

	err := reg.RegisterWorker(proof)
	require.NoError(t, err)

	require.Equal(t, "testing", state.Credentials.ClientID)
	require.Equal(t, "at", state.Credentials.AccessToken)
	require.Equal(t, "cert", state.Credentials.Certificate)
	require.Equal(t, expires, state.CredentialsExpire)
	require.Equal(t, tc.GetFakeWorkerManagerWorkerSecret(), state.RegistrationSecret)

	require.Equal(t, true, state.WorkerConfig.MustGet("from-register-worker"), "value for from-register-worker")
	require.Equal(t, "a file.", state.Files[0].Description)

	call, err := tc.FakeWorkerManagerRegistration()
	require.NoError(t, err)
	require.Equal(t, "wp/id", call.WorkerPoolID)
	require.Equal(t, "prov", call.ProviderID)
	require.Equal(t, "wg", call.WorkerGroup)
	require.Equal(t, "wid", call.WorkerID)
	require.Equal(t, json.RawMessage([]byte(`{"because":"I said so"}`)), call.WorkerIdentityProof)
}

func TestCredsExpirationGraceful(t *testing.T) {
	runnercfg := cfg.RunnerConfig{}
	state := run.State{
		// message is sent 30 seconds before expiration, so set expiration
		// for 30s from now
		CredentialsExpire: tcclient.Time(time.Now().Add(30 * time.Second)),
	}

	reg := new(&runnercfg, &state, tc.FakeWorkerManagerClientFactory)
	reg.credsExpireCond = sync.NewCond(&sync.Mutex{})
	reg.credsExpireCond.L.Lock()

	wkr := ptesting.NewFakeWorkerWithCapabilities("graceful-termination")
	defer wkr.Close()

	gotTerminated := wkr.MessageReceivedFunc("graceful-termination", func(msg workerproto.Message) bool {
		return msg.Properties["finish-tasks"].(bool) == false
	})

	reg.SetProtocol(wkr.RunnerProtocol)

	err := reg.WorkerStarted()
	wkr.RunnerProtocol.Start(false)
	assert.NoError(t, err)

	// wait for the creds to expire..
	reg.credsExpireCond.Wait()

	require.True(t, gotTerminated())

	err = reg.WorkerFinished()
	assert.NoError(t, err)
}

func TestCredsExpirationNewCredentials(t *testing.T) {
	defer filet.CleanUp(t)
	dir := filet.TmpDir(t, "")
	cachePath := filepath.Join(dir, "cache.json")

	runnercfg := cfg.RunnerConfig{
		CacheOverRestarts: cachePath,
	}
	state := run.State{
		// set the credentials to expire such that we reregister
		// immediately
		CredentialsExpire:  tcclient.Time(time.Now().Add(1 * time.Second)),
		RegistrationSecret: "secret-from-reg",
	}

	// expires is rounded to a whole second to avoid issues with microsecond
	// rounding when round-tripping through JSON
	expires := tcclient.Time(time.Now().Add(90 * time.Minute).Round(time.Second))
	tc.SetFakeWorkerManagerWorkerSecret("secret-from-reg")
	tc.SetFakeWorkerManagerWorkerExpires(expires)

	fmt.Printf("setting fake expires to %s\n", expires)
	reg := new(&runnercfg, &state, tc.FakeWorkerManagerClientFactory)
	reg.credsExpireCond = sync.NewCond(&sync.Mutex{})
	reg.credsExpireCond.L.Lock()

	wkr := ptesting.NewFakeWorkerWithCapabilities("graceful-termination", "new-credentials")
	defer wkr.Close()

	gotTerminated := wkr.MessageReceivedFunc("graceful-termination", func(msg workerproto.Message) bool {
		return msg.Properties["finish-tasks"].(bool) == false
	})
	gotCredentials := wkr.MessageReceivedFunc("new-credentials", func(msg workerproto.Message) bool {
		return msg.Properties["client-id"].(string) == "testing-rereg" &&
			msg.Properties["access-token"].(string) == "at-rereg" &&
			msg.Properties["certificate"].(string) == "cert-rereg"
	})

	reg.SetProtocol(wkr.RunnerProtocol)

	err := reg.WorkerStarted()
	wkr.RunnerProtocol.Start(false)
	assert.NoError(t, err)

	// wait for the creds to expire..
	reg.credsExpireCond.Wait()

	// expect a new set of credentials, but not a termination
	require.True(t, gotCredentials())
	require.False(t, gotTerminated())

	require.Equal(t, "testing-rereg", state.Credentials.ClientID)
	require.Equal(t, "at-rereg", state.Credentials.AccessToken)
	require.Equal(t, "cert-rereg", state.Credentials.Certificate)
	require.Equal(t, expires, state.CredentialsExpire)
	require.Equal(t, tc.GetFakeWorkerManagerWorkerSecret(), state.RegistrationSecret)

	call, err := tc.FakeWorkerManagerReregistration()
	require.NoError(t, err)
	require.Equal(t, "secret-from-reg", call.Secret)

	var cachedState run.State
	found, err := run.ReadCacheFile(&cachedState, cachePath)
	assert.True(t, found)
	assert.NoError(t, err)

	require.Equal(t, "testing-rereg", cachedState.Credentials.ClientID)
	require.Equal(t, "at-rereg", cachedState.Credentials.AccessToken)
	require.Equal(t, "cert-rereg", cachedState.Credentials.Certificate)
	// compare strings as internal implementation details differ
	require.Equal(t, expires.String(), cachedState.CredentialsExpire.String())
	require.Equal(t, tc.GetFakeWorkerManagerWorkerSecret(), cachedState.RegistrationSecret)

	err = reg.WorkerFinished()
	assert.NoError(t, err)
}

func TestUntilRenew(t *testing.T) {
	t.Run("90m", func(t *testing.T) {
		// for a long duration, renew longSetback in advance
		require.Equal(t, 60*time.Minute, renewBeforeExpire(90*time.Minute))
	})
	t.Run("31m", func(t *testing.T) {
		// for a shorter duration, wait at least a bit to renew
		require.Equal(t, 5*time.Minute, renewBeforeExpire(31*time.Minute))
	})
	t.Run("20m", func(t *testing.T) {
		// similar, but less than longSetback
		require.Equal(t, 5*time.Minute, renewBeforeExpire(20*time.Minute))
	})
	t.Run("4m", func(t *testing.T) {
		// but don't wait too long
		require.Equal(t, 210*time.Second, renewBeforeExpire(240*time.Second))
	})
	t.Run("30s", func(t *testing.T) {
		require.Equal(t, time.Duration(0), renewBeforeExpire(30*time.Second))
	})
	t.Run("Zero", func(t *testing.T) {
		require.Equal(t, time.Duration(0), renewBeforeExpire(0))
	})
}

func TestUseCachedRun_Expired(t *testing.T) {
	defer filet.CleanUp(t)
	dir := filet.TmpDir(t, "")
	cachePath := filepath.Join(dir, "cache.json")

	runnercfg := cfg.RunnerConfig{
		CacheOverRestarts: cachePath,
	}
	state := run.State{
		// set the credentials to be expired
		CredentialsExpire:  tcclient.Time(time.Now().Add(-1 * time.Hour)),
		RegistrationSecret: "secret-from-reg",
	}

	reg := new(&runnercfg, &state, tc.FakeWorkerManagerClientFactory)
	err := reg.UseCachedRun()
	require.Error(t, err)
}
