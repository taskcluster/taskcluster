package cfg

import (
	"testing"

	"github.com/stretchr/testify/require"
	yaml "gopkg.in/yaml.v3"
)

func TestUnmarshalLoggingYAML(t *testing.T) {
	var lc LoggingConfig

	err := yaml.Unmarshal([]byte("implementation: stdio\nfoo: bar"), &lc)
	if err != nil {
		t.Fatalf("failed to load: %s", err)
	}
	require.Equal(t, "stdio", lc.Implementation)
	require.Equal(t, map[string]interface{}{"foo": "bar"}, lc.Data)
}
