package slugid

import (
	"slices"
	"testing"
	"uuid"
)

// These tests are ported from:
// https://github.com/taskcluster/slugid-go/blob/main/slugid/slugid_test.go

// Test that we can correctly encode a "non-nice" uuid (with first bit set) to
// its known slug. The specific uuid was chosen since it has a slug which
// contains both `-` and `_` characters.
func TestEncode(t *testing.T) {
	u := uuid.MustParse("804f3fc8-dfcb-4b06-89fb-aefad5e18754")
	if got, want := Encode(u), "gE8_yN_LSwaJ-6761eGHVA"; got != want {
		t.Errorf("Encode(%s) = %q, want %q", u, got, want)
	}
}

// Test that we can decode a "non-nice" slug (first bit of uuid is set) that
// begins with `-`
func TestDecode(t *testing.T) {
	got, err := Decode("--------Q--__________Q")
	if err != nil {
		t.Fatal(err)
	}
	if want := uuid.MustParse("fbefbefb-efbe-43ef-bfff-fffffffffffd"); got != want {
		t.Errorf("Decode = %s, want %s", got, want)
	}
}

func TestDecodeInvalid(t *testing.T) {
	for _, slug := range []string{
		"",
		"not really a slug",
		"eWIgwMgxSfeXQ36iPbOx",     // too short
		"eWIgwMgxSfeXQ36iPbOxiQAA", // too long
		"eWIgwMgxSfeXQ36iPbOxiQ==", // padded
		"eWIgwMgxSfeXQ36iPbOx+/",   // standard (not url-safe) alphabet
	} {
		if u, err := Decode(slug); err == nil {
			t.Errorf("Decode(%q) = %s, want error", slug, u)
		}
	}
}

// Test that 10000 v4 uuids are unchanged after encoding and then decoding them
func TestUUIDEncodeDecode(t *testing.T) {
	for range 10000 {
		u1 := uuid.NewV4()
		u2, err := Decode(Encode(u1))
		if err != nil {
			t.Fatal(err)
		}
		if u1 != u2 {
			t.Fatalf("Encode and decode isn't identity: %s != %s", u1, u2)
		}
	}
}

// Test that 10000 v4 slugs are unchanged after decoding and then encoding them
func TestSlugDecodeEncode(t *testing.T) {
	for range 10000 {
		slug1 := V4()
		u, err := Decode(slug1)
		if err != nil {
			t.Fatal(err)
		}
		if slug2 := Encode(u); slug1 != slug2 {
			t.Fatalf("Decode and encode isn't identity: %q != %q", slug1, slug2)
		}
	}
}

const (
	charsAll = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
	// 0 - 31: 0b0xxxxx
	charsC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef"
	// 16, 17, 18, 19: 0b0100xx
	charsD = "QRST"
	// 2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54, 58, 62: 0bxxxx10
	charsE = "CGKOSWaeimquy26-"
	// 0, 16, 32, 48: 0bxx0000
	charsF = "AQgw"
)

// Make sure that all allowed characters can appear in all allowed positions
// within the "nice" slug, and that no other characters appear in positions in
// which they are not allowed.
//
// The 128 bits of a v4 uuid, with the 6 bits fixed by RFC 9562 and the first
// bit fixed by Nice, map onto base64 characters as follows:
//
// bin: 0xxxxx..........................................0100xx......xxxx10............................................................xx0000
// b64:   $C  < 01 >< 02 >< 03 >< 04 >< 05 >< 06 >< 07 >  $D  < 09 >  $E  < 11 >< 12 >< 13 >< 14 >< 15 >< 16 >< 17 >< 18 >< 19 >< 20 >  $F
func TestSpreadNice(t *testing.T) {
	spreadTest(t, Nice, [22]string{
		charsC, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll,
		charsD, charsAll, charsE, charsAll, charsAll, charsAll, charsAll, charsAll,
		charsAll, charsAll, charsAll, charsAll, charsAll, charsF,
	})
}

// Same as TestSpreadNice, but a V4 slug can start with any base64 character
// since the first six bits of the uuid are random.
func TestSpreadV4(t *testing.T) {
	spreadTest(t, V4, [22]string{
		charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll,
		charsD, charsAll, charsE, charsAll, charsAll, charsAll, charsAll, charsAll,
		charsAll, charsAll, charsAll, charsAll, charsAll, charsF,
	})
}

// spreadTest calls generator 64*40 times and checks that, for each position,
// the set of characters seen exactly matches expected. A monte-carlo test of
// the original implementation showed no failures in 1000 simulations with
// 64*20 iterations, so 64*40 rules out false positives.
func spreadTest(t *testing.T, generator func() string, expected [22]string) {
	t.Helper()
	var seen [22]map[rune]bool
	for i := range seen {
		seen[i] = map[rune]bool{}
	}
	for range 64 * 40 {
		slug := generator()
		if len(slug) != 22 {
			t.Fatalf("generated slug %q does not have 22 characters", slug)
		}
		for j, char := range slug {
			seen[j][char] = true
		}
	}
	for j := range seen {
		var got []rune
		for c := range seen[j] {
			got = append(got, c)
		}
		slices.Sort(got)
		want := []rune(expected[j])
		slices.Sort(want)
		if !slices.Equal(got, want) {
			t.Errorf("position %d: got characters %q, want %q", j, string(got), string(want))
		}
	}
}
