package signin

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidateScopes(t *testing.T) {
	require.NoError(t, validateScopes([]string{"*", "foo:*", "baguette~ nom"}))
	require.NoError(t, validateScopes(nil))

	for _, scope := range []string{"foo\nbar", "foo\r\nbar", "foo\tbar", "café", "\x7f"} {
		require.Error(t, validateScopes([]string{"ok", scope}), "scope %q", scope)
	}
}
