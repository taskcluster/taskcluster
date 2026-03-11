package logging

import (
	"regexp"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestToUnstructured(t *testing.T) {
	stripHex := func(s string) string {
		hex := regexp.MustCompile(`0x[0-9a-f]+`)
		return string(hex.ReplaceAll([]byte(s), []byte("0xffff")))
	}

	t.Run("empty", func(t *testing.T) {
		require.Equal(t,
			`{}`,
			ToUnstructured(map[string]any{}))
	})
	t.Run("without textPayload", func(t *testing.T) {
		require.Equal(t,
			`a: uh; b: oh`,
			ToUnstructured(map[string]any{"a": "uh", "b": "oh"}))
	})
	t.Run("with textPayload", func(t *testing.T) {
		require.Equal(t,
			`uhoh; level: bad`,
			ToUnstructured(map[string]any{"textPayload": "uhoh", "level": "bad"}))
	})
	t.Run("with textPayload, but not a string", func(t *testing.T) {
		require.Equal(t,
			`level: bad; textPayload: ["uh","oh"]`,
			ToUnstructured(map[string]any{"textPayload": []string{"uh", "oh"}, "level": "bad"}))
	})
	t.Run("with non-string values", func(t *testing.T) {
		require.Equal(t,
			`array: [1,2]; bool: false; number: 4`,
			ToUnstructured(map[string]any{"array": []int{1, 2}, "bool": false, "number": 4}))
	})
	t.Run("with non-json-able values", func(t *testing.T) {
		require.Equal(t,
			`wat: (func())(0xffff)`,
			stripHex(ToUnstructured(map[string]any{"wat": func() {}})))
	})
}

func TestToStructured(t *testing.T) {
	t.Run("simple payload", func(t *testing.T) {
		require.Equal(t, map[string]any{"textPayload": "uhoh"}, ToStructured("uhoh"))
	})
}
