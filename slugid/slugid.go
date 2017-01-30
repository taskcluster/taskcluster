package slugid

import (
	"fmt"
	"os"
	"regexp"

	uuidlib "github.com/pborman/uuid"
	sluglib "github.com/taskcluster/slugid-go/slugid"
	"github.com/taskcluster/taskcluster-cli/extpoints"
)

var (
	// See https://github.com/taskcluster/slugid-go/blob/master/README.md for
	// an explanation of these regular expressions. Note, compiling once is
	// more performant than compiling with each decode/encode call. We can use
	// regexp.MustCompile rather than regexp.Compile since these are constant
	// strings.

	// V4_SLUG_REGEXP is the regular expression that all V4 Slug IDs should conform to
	V4_SLUG_REGEXP = regexp.MustCompile("^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$")

	// V4_UUID_REGEXP is the regular expression that all V4 UUIDs should conform to
	V4_UUID_REGEXP = regexp.MustCompile("^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$")

	// NICE_SLUG_REGEXP is the regular expression that all "nice" Slug IDs should conform to
	NICE_SLUG_REGEXP = regexp.MustCompile("^[A-Za-f][A-Za-z0-9_-]{7}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$")

	// NICE_UUID_REGEXP is the regular expression that all "nice" UUIDs should conform to
	NICE_UUID_REGEXP = regexp.MustCompile("^[0-7][a-f0-9]{7}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$")
)

func init() {
	extpoints.Register("slugid", slugid{})
}

type slugid struct{}

func (slugid) ConfigOptions() map[string]extpoints.ConfigOption {
	return nil
}

func (slugid) Summary() string {
	return "Generates V4 UUIDs and encodes/decodes them from/to 22 character URL-safe base64 slugs"
}

func (slugid) Usage() string {
	return `
Usage:
  taskcluster slugid v4
  taskcluster slugid nice
  taskcluster slugid decode <slug>
  taskcluster slugid encode <uuid>
`
}

func (slugid) Execute(context extpoints.Context) bool {
	args := context.Arguments

	var out string
	var err error

	// what function was called?
	if args["v4"] == true {
		out, err = v4()
	} else if args["nice"] == true {
		out, err = nice()
	} else if args["decode"] == true { // decode slug
		out, err = decode(context)
	} else if args["encode"] == true { // encode slug
		out, err = encode(context)
	}
	// ...and docopt will react to unrecognized commands

	// print the error if there's one
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s\n", err)
		return false
	}

	// or print the output
	fmt.Println(out)
	return true
}

// normal v4 uuid generation
func v4() (string, error) {
	return sluglib.V4(), nil
}

// generates uuid with "nice" properties
func nice() (string, error) {
	return sluglib.Nice(), nil
}

// decodes slug into a uuid
func decode(context extpoints.Context) (string, error) {
	slug := context.Arguments["<slug>"].(string)

	// nice slugs are just a subset of all slugs, which must match V4 pattern
	// this slug may be nice or not; we don't know, so use general pattern
	match := V4_SLUG_REGEXP.MatchString(slug)
	if match == false {
		return "", fmt.Errorf("Invalid slug format: %s", slug)
	}

	// and decode
	return fmt.Sprintf("%s", sluglib.Decode(slug)), nil
}

// encodes uuid into a slug
func encode(context extpoints.Context) (string, error) {
	uuid := context.Arguments["<uuid>"].(string)

	// nice slugs are just a subset of all slugs, which must match V4 pattern
	// this slug may be nice or not; we don't know, so use general pattern
	match := V4_UUID_REGEXP.MatchString(uuid)
	if match == false {
		return "", fmt.Errorf("Invalid uuid format: %s", uuid)
	}

	// the uuid string needs to be parsed into uuidlib.UUID before encoding
	return sluglib.Encode(uuidlib.Parse(uuid)), nil
}
