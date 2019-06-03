// Licensed under the Mozilla Public Licence 2.0.
// https://www.mozilla.org/en-US/MPL/2.0

package slugid_test

import (
	"fmt"
	"reflect"
	"runtime"
	"sort"
	"testing"

	"github.com/pborman/uuid"
	"github.com/taskcluster/slugid-go/slugid"
)

func ExampleNice() {
	slugid.Nice() // e.g. "eWIgwMgxSfeXQ36iPbOxiQ"
}

func ExampleDecode() {
	fmt.Printf("%s\n", slugid.Decode("eWIgwMgxSfeXQ36iPbOxiQ"))
	// Output: 796220c0-c831-49f7-9743-7ea23db3b189
}

func ExampleEncode() {
	fmt.Println(slugid.Encode(uuid.Parse("796220c0-c831-49f7-9743-7ea23db3b189")))
	// Output: eWIgwMgxSfeXQ36iPbOxiQ
}

func ExampleV4() {
	slugid.Nice() // e.g. "-9OpXaCORAaFh4sJRk7PUA"
}

// Test that we can correctly encode a "non-nice" uuid (with first bit set) to
// its known slug. The specific uuid was chosen since it has a slug which
// contains both `-` and `_` characters.
func TestEncode(t *testing.T) {

	// 10000000010011110011111111001000110111111100101101001011000001101000100111111011101011101111101011010101111000011000011101010100....
	// <8 ><0 ><4 ><f ><3 ><f ><c ><8 ><d ><f ><c ><b ><4 ><b ><0 ><6 ><8 ><9 ><f ><b ><a ><e ><f ><a ><d ><5 ><e ><1 ><8 ><7 ><5 ><4 >
	// < g  >< E  >< 8  >< _  >< y  >< N  >< _  >< L  >< S  >< w  >< a  >< J  >< -  >< 6  >< 7  >< 6  >< 1  >< e  >< G  >< H  >< V  >< A  >
	uuid_ := uuid.Parse("804f3fc8-dfcb-4b06-89fb-aefad5e18754")
	expectedSlug := "gE8_yN_LSwaJ-6761eGHVA"
	actualSlug := slugid.Encode(uuid_)

	if expectedSlug != actualSlug {
		t.Errorf("UUID not correctly encoded into slug: '" + expectedSlug + "' != '" + actualSlug + "'")
	}
}

// Test that we can decode a "non-nice" slug (first bit of uuid is set) that
// begins with `-`
func TestDecode(t *testing.T) {
	// 11111011111011111011111011111011111011111011111001000011111011111011111111111111111111111111111111111111111111111111111111111101....
	// <f ><b ><e ><f ><b ><e ><f ><b ><e ><f ><b ><e ><4 ><3 ><e ><f ><b ><f ><f ><f ><f ><f ><f ><f ><f ><f ><f ><f ><f ><f ><f ><d >
	// < -  >< -  >< -  >< -  >< -  >< -  >< -  >< -  >< Q  >< -  >< -  >< -  >< _  >< _  >< _  >< _  >< _  >< _  >< _  >< _  >< _  >< Q  >
	slug := "--------Q--__________Q"
	expectedUuid := uuid.Parse("fbefbefb-efbe-43ef-bfff-fffffffffffd")
	actualUuid := slugid.Decode(slug)

	if expectedUuid.String() != actualUuid.String() {
		t.Errorf("Slug not correctly decoded into uuid: '%s' != '%s'", expectedUuid, actualUuid)
	}
}

// Test that 10000 v4 uuids are unchanged after encoding and then decoding them
func TestUuidEncodeDecode(t *testing.T) {
	for i := 0; i < 10000; i++ {
		uuid1 := uuid.NewRandom()
		slug := slugid.Encode(uuid1)
		uuid2 := slugid.Decode(slug)
		if uuid1.String() != uuid2.String() {
			t.Errorf("Encode and decode isn't identity: '%s' != '%s'", uuid1, uuid2)
		}
	}
}

// Test that 10000 v4 slugs are unchanged after decoding and then encoding them.
func TestSlugDecodeEncode(t *testing.T) {
	for i := 0; i < 10000; i++ {
		slug1 := slugid.V4()
		uuid_ := slugid.Decode(slug1)
		slug2 := slugid.Encode(uuid_)
		if slug1 != slug2 {
			t.Errorf("Decode and encode isn't identity: '%s' != '%s'", slug1, slug2)
		}
	}
}

// Make sure that all allowed characters can appear in all allowed positions
// within the "nice" slug. In this test we generate over a thousand slugids,
// and make sure that every possible allowed character per position appears at
// least once in the sample of all slugids generated. We also make sure that no
// other characters appear in positions in which they are not allowed.
//
// base 64 encoding char -> value:
// ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_
// 0         1         2         3         4         5          6
// 0123456789012345678901234567890123456789012345678901234567890123
//
// e.g. from this we can see 'j' represents 35 in base64
//
// The following comments show the 128 bits of the v4 uuid in binary, hex and
// base 64 encodings. The 6 fixed bits (`0`/`1`) according to RFC 4122, plus
// the first (most significant) fixed bit (`0`) are shown among the 121
// arbitrary value bits (`.`/`x`). The `x` means the same as `.` but just
// highlights which bits are grouped together for the respective encoding.
//
// schema:
//      <..........time_low............><...time_mid...><time_hi_+_vers><clk_hi><clk_lo><.....................node.....................>
//
// bin: 0xxx............................................0100............10xx............................................................
// hex:  $A <01><02><03><04><05><06><07><08><09><10><11> 4  <13><14><15> $B <17><18><19><20><21><22><23><24><25><26><27><28><29><30><31>
//
// => $A in {0, 1, 2, 3, 4, 5, 6, 7} (0b0xxx)
// => $B in {8, 9, A, B} (0b10xx)
//
// bin: 0xxxxx..........................................0100xx......xxxx10............................................................xx0000
// b64:   $C  < 01 >< 02 >< 03 >< 04 >< 05 >< 06 >< 07 >  $D  < 09 >  $E  < 11 >< 12 >< 13 >< 14 >< 15 >< 16 >< 17 >< 18 >< 19 >< 20 >  $F
//
// => $C in {A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z, a, b, c, d, e, f} (0b0xxxxx)
// => $D in {Q, R, S, T} (0b0100xx)
// => $E in {C, G, K, O, S, W, a, e, i, m, q, u, y, 2, 6, -} (0bxxxx10)
// => $F in {A, Q, g, w} (0bxx0000)
func TestSpreadNice(t *testing.T) {

	charsAll := "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
	// 0 - 31: 0b0xxxxx
	charsC := "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef"
	// 16, 17, 18, 19: 0b0100xx
	charsD := "QRST"
	// 2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54, 58, 62: 0bxxxx10
	charsE := "CGKOSWaeimquy26-"
	// 0, 16, 32, 48: 0bxx0000
	charsF := "AQgw"
	expected := []string{charsC, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsD, charsAll, charsE, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsF}
	spreadTest(t, slugid.Nice, expected)
}

// This test is the same as niceSpreadTest but for slugid.V4() rather than
// slugid.Nice(). The only difference is that a v4() slug can start with any of
// the base64 characters since the first six bits of the uuid are random."""
func TestSpreadV4(t *testing.T) {

	charsAll := "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
	// 16, 17, 18, 19: 0b0100xx
	charsD := "QRST"
	// 2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54, 58, 62: 0bxxxx10
	charsE := "CGKOSWaeimquy26-"
	// 0, 16, 32, 48: 0bxx0000
	charsF := "AQgw"
	expected := []string{charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsD, charsAll, charsE, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsF}
	spreadTest(t, slugid.V4, expected)
}

// `spreadTest` runs a test against the `generator` function, to check that
// when calling it 64*40 times, the range of characters per string position it
// returns matches the array `expected`, where each entry in `expected` is a
// string of all possible characters that should appear in that position in the
// string, at least once in the sample of 64*40 responses from the `generator`
// function
func spreadTest(t *testing.T, generator func() string, expected []string) {

	// k is an array which stores which characters were found at which
	// positions. It has one entry per slugid character, therefore 22 entries.
	// Each entry is a map with a key for each character found, and its value
	// as the number of times that character appeared at that position in the
	// slugid in the large sample of slugids generated in this test.
	var k [22]map[rune]int
	for i := 0; i < 22; i++ {
		k[i] = make(map[rune]int)
	}

	// Generate a large sample of slugids, and record what characters appeared
	// where...  A monte-carlo test has demonstrated that with 64 * 20
	// iterations, no failure occurred in 1000 simulations, so 64 * 40 should be
	// suitably large to rule out false positives.
	for i := 0; i < 64*40; i++ {
		slug := generator()
		if len(slug) != 22 {
			t.Fatalf("Generated slug '%s' does not have 22 characters", slug)
		}
		for j, char := range slug {
			k[j][char] = k[j][char] + 1
		}
	}

	// Compose results into an array `actual`, for comparison with `expected`
	var actual [22][]int
	actualRange := ""
	for j := 0; j < 22; j++ {
		actual[j] = make([]int, 0)
		for a := range k[j] {
			actual[j] = append(actual[j], int(a))
		}
		sort.Ints(actual[j])
		for _, c := range actual[j] {
			actualRange += string(c)
		}
		actualRange += "\n"
	}

	expectedRange := ""
	for _, s := range expected {
		bytes := []byte(s)
		chars := make([]int, 0)
		for _, a := range bytes {
			chars = append(chars, int(a))
		}
		sort.Ints(chars)
		for _, c := range chars {
			expectedRange += string(c)
		}
		expectedRange += "\n"
	}
	if expectedRange != actualRange {
		t.Errorf("In a large sample of generated slugids (using function %s), the range of characters found per character position in the sample did not match expected results.\n\nExpected: \n%s\n\nActual: \n%s", functionName(generator), expectedRange, actualRange)
	}
}

func functionName(i interface{}) string {
	return runtime.FuncForPC(reflect.ValueOf(i).Pointer()).Name()
}

func TestDecodeInvalidSlug(t *testing.T) {
	uuid_ := slugid.Decode("not really a slug")
	if uuid_ != nil {
		t.Errorf("Decoding an invalid slug should return nil, but returned %s.", uuid_)
	}
}
