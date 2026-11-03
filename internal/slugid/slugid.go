// Package slugid generates v4 UUIDs and encodes them as 22 character URL-safe
// base64 slugs (see RFC 4648 sec. 5), stripped of `=` padding.
//
// This is a port of github.com/taskcluster/slugid-go, built on the standard
// library uuid package.
//
// There are two methods for generating slugs: V4 and Nice.
//
// V4 returns a slug from a randomly generated v4 uuid.
//
// Nice returns a v4 slug that additionally starts with `[A-Za-f]`, which
// implies that the first (most significant) bit of its uuid is 0. Regular
// slugs can safely be used in urls and AMQP routing keys, but slugs beginning
// with `-` may cause problems when used as command line parameters. Nice slugs
// avoid this at a cost to entropy (121 bits vs 122 bits for V4 slugs).
//
// V4 slugs conform to
// `[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]`
//
// Nice slugs conform to
// `[A-Za-f][A-Za-z0-9_-]{7}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]`
package slugid

import (
	"encoding/base64"
	"fmt"
	"uuid"
)

// Encode returns the given uuid as a 22 character slug. This can be a regular
// v4 slug or a "nice" slug.
func Encode(u uuid.UUID) string {
	return base64.RawURLEncoding.EncodeToString(u[:])
}

// Decode returns the uuid represented by the given v4 or "nice" slug.
func Decode(slug string) (uuid.UUID, error) {
	b, err := base64.RawURLEncoding.DecodeString(slug)
	if err != nil {
		return uuid.Nil(), fmt.Errorf("invalid slug %q: %w", slug, err)
	}
	if len(b) != len(uuid.UUID{}) {
		return uuid.Nil(), fmt.Errorf("invalid slug %q: decodes to %d bytes, want %d", slug, len(b), len(uuid.UUID{}))
	}
	return uuid.UUID(b), nil
}

// V4 returns a randomly generated v4 uuid compliant slug.
func V4() string {
	return Encode(uuid.NewV4())
}

// Nice returns a randomly generated v4 uuid compliant slug which starts with
// `[A-Za-f]`, so that it is safe to use as a command line parameter.
func Nice() string {
	u := uuid.NewV4()
	// unset most significant bit of first byte to ensure slug starts with [A-Za-f]
	u[0] &= 0x7f
	return Encode(u)
}
