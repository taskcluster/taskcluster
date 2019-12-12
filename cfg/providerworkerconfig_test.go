package cfg

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster-worker-runner/files"
)

func TestPWCCorrectForm(t *testing.T) {
	var pwc ProviderWorkerConfig

	err := json.Unmarshal([]byte(`{
      "worker": {
	    "config": {
		  "someValue": true
		},
		"files": [
		  {
			"description": "my file"
		  }
		]
	  }
	}`), &pwc)
	if err != nil {
		t.Fatalf("failed to load: %s", err)
	}
	require.Equal(t, true, pwc.Config.MustGet("someValue"))
	require.Equal(t, "my file", pwc.Files[0].Description)
}

func TestPWCCompatibilityGenericWorkerForm(t *testing.T) {
	var pwc ProviderWorkerConfig

	err := json.Unmarshal([]byte(`{
      "genericWorker": {
	    "config": {
		  "someValue": true
		},
		"files": [
		  {
			"description": "my file"
		  }
		]
	  }
	}`), &pwc)
	if err != nil {
		t.Fatalf("failed to load: %s", err)
	}
	require.Equal(t, true, pwc.Config.MustGet("someValue"))
	require.Equal(t, "my file", pwc.Files[0].Description)
}

func TestPWCCompatibilityFlatFormForm(t *testing.T) {
	var pwc ProviderWorkerConfig

	err := json.Unmarshal([]byte(`{
	  "someValue": true
	}`), &pwc)
	if err != nil {
		t.Fatalf("failed to load: %s", err)
	}
	require.Equal(t, true, pwc.Config.MustGet("someValue"))
	require.Equal(t, 0, len(pwc.Files))
}

func TestPWCBadForm(t *testing.T) {
	var pwc ProviderWorkerConfig

	// This is sort of unfortunate, but inputs that don't map precisely to the
	// expected form are instead treated as the old flat form, rather than being
	// seen as an error.  When we drop support for the flat form, this will be
	// handled more naturally.
	err := json.Unmarshal([]byte(`{
      "worker": {
	    "config": true,
		"files": []
	  }
	}`), &pwc)
	if err != nil {
		t.Fatalf("failed to load: %s", err)
	}
	require.Equal(t, true, pwc.Config.MustGet("worker.config"))
}

func TestPWCMarshal(t *testing.T) {
	var wc = NewWorkerConfig()
	wc, _ = wc.Set("some-value", true)
	pwc := ProviderWorkerConfig{
		Config: wc,
		Files: []files.File{
			files.File{
				Description: "my file",
			},
		},
	}

	marsh, err := json.Marshal(pwc)
	require.NoError(t, err)

	var pwc2 ProviderWorkerConfig
	err = json.Unmarshal(marsh, &pwc2)
	require.NoError(t, err)
	require.Equal(t, pwc, pwc2)
}
