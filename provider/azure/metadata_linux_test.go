// +build linux

package azure

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLoadCustomData(t *testing.T) {

	origCustomDataPath := customDataPath
	customDataPath = "testdata/ovf-env.xml"
	defer func() {
		customDataPath = origCustomDataPath
	}()
	ms := realMetadataService{}

	cd, err := ms.loadCustomData()
	require.NoError(t, err)

	customData := &CustomData{}
	err = json.Unmarshal([]byte(cd), customData)
	require.NoError(t, err)

	require.Equal(t, "testing/azure-stuff", customData.WorkerPoolId)
	require.Equal(t, "azure", customData.ProviderId)
	require.Equal(t, "https://taskcluster.imbstack.com", customData.RootURL)
	require.Equal(t, "azure", customData.WorkerGroup)
	require.Equal(t, "{}", string(*customData.ProviderWorkerConfig))
}
