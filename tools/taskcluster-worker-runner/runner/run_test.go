package runner

import (
	"fmt"
	"io/ioutil"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/Flaque/filet"
	"github.com/stretchr/testify/require"
)

func buildFakeGenericWorker(workerPath string) error {
	cmd := exec.Command("go")
	// fake.go just exits 0
	cmd.Args = append(cmd.Args, "build", "-o", workerPath, "../worker/genericworker/fake")
	return cmd.Run()
}

func TestFakeGenericWorker(t *testing.T) {
	defer filet.CleanUp(t)
	dir := filet.TmpDir(t, "")
	workerPath := filepath.Join(dir, "fake.exe")
	configPath := filepath.Join(dir, "runner.yaml")
	workerConfigPath := filepath.Join(dir, "worker.yaml")

	require.NoError(t, buildFakeGenericWorker(workerPath))

	configData := fmt.Sprintf(`
provider:
  providerType: standalone
  rootURL: https://tc.example.com
  clientID: fake
  accessToken: fake
  workerPoolID: pp/ww
  workerGroup: wg
  workerID: wi
getSecrets: false
worker:
  implementation: generic-worker
  configPath: %s
  path: %s
`, workerConfigPath, workerPath)

	err := ioutil.WriteFile(configPath, []byte(configData), 0755)
	require.NoError(t, err)

	// checks exit code of running fake worker
	_, err = Run(configPath)
	require.NoError(t, err)

	// sleep a short bit to let NTFS figure out that fake.exe isn't in use anymore
	// and it's safe to delete
	if runtime.GOOS == "windows" {
		time.Sleep(5 * time.Second)
	}
}

func TestDummy(t *testing.T) {
	defer filet.CleanUp(t)
	dir := filet.TmpDir(t, "")
	configPath := filepath.Join(dir, "runner.yaml")

	err := ioutil.WriteFile(configPath, []byte(`
provider:
  providerType: standalone
  rootURL: https://tc.example.com
  clientID: fake
  accessToken: fake
  workerPoolID: pp/ww
  workerGroup: wg
  workerID: wi
getSecrets: false
worker:
  implementation: dummy
`), 0755)
	require.NoError(t, err)

	run, err := Run(configPath)
	require.NoError(t, err)

	// spot-check some run values; the main point here is that
	// an error does not occur
	require.Equal(t, "https://tc.example.com", run.RootURL)
	require.Equal(t, "fake", run.Credentials.ClientID)
	require.Equal(t, "pp/ww", run.WorkerPoolID)
}

func TestDummyCached(t *testing.T) {
	defer filet.CleanUp(t)
	dir := filet.TmpDir(t, "")
	configPath := filepath.Join(dir, "runner.yaml")
	cachePath := filepath.Join(dir, "cache.json")

	err := ioutil.WriteFile(configPath, []byte(fmt.Sprintf(`
provider:
  providerType: standalone
  rootURL: https://tc.example.com
  clientID: fake
  accessToken: fake
  workerPoolID: pp/ww
  workerGroup: wg
  workerID: wi
getSecrets: false
cacheOverRestarts: %s
workerConfig:
  fromFirstRun: true
worker:
  implementation: dummy
`, cachePath)), 0755)
	require.NoError(t, err)

	run, err := Run(configPath)
	require.NoError(t, err)

	require.Equal(t, true, run.WorkerConfig.MustGet("fromFirstRun"))

	// slightly different config this time, omitting `fromFirstRun`:
	err = ioutil.WriteFile(configPath, []byte(fmt.Sprintf(`
provider:
  providerType: standalone
  rootURL: https://tc.example.com
  clientID: fake
  accessToken: fake
  workerPoolID: pp/ww
  workerGroup: wg
  workerID: wi
getSecrets: false
cacheOverRestarts: %s
worker:
  implementation: dummy
`, cachePath)), 0755)
	require.NoError(t, err)

	run, err = Run(configPath)
	require.NoError(t, err)

	require.Equal(t, true, run.WorkerConfig.MustGet("fromFirstRun"))
}
