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

	// RegexpSlugV4 is the regular expression that all V4 Slug IDs should conform to
	RegexpSlugV4 = regexp.MustCompile("^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$")

	// RegexpUUIDV4 is the regular expression that all V4 UUIDs should conform to
	RegexpUUIDV4 = regexp.MustCompile("^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$")

	// RegexpSlugNice is the regular expression that all "nice" Slug IDs should conform to
	RegexpSlugNice = regexp.MustCompile("^[A-Za-f][A-Za-z0-9_-]{7}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$")

	// RegexpUUIDNice is the regular expression that all "nice" UUIDs should conform to
	RegexpUUIDNice = regexp.MustCompile("^[0-7][a-f0-9]{7}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$")
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
	if args["v4"].(bool) {
		out, err = generateV4()
	} else if args["nice"].(bool) {
		out, err = generateNice()
	} else if args["decode"].(bool) { // decode slug
		out, err = decode(context.Arguments["<slug>"].(string))
	} else if args["encode"].(bool) { // encode slug
		out, err = encode(context.Arguments["<uuid>"].(string))
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

// generateV4 generates a normal v4 uuid
func generateV4() (string, error) {
	return sluglib.V4(), nil
}

// generateNice generates a uuid with "nice" properties
func generateNice() (string, error) {
	return sluglib.Nice(), nil
}

// decode decodes a slug into a uuid
func decode(slug string) (string, error) {
	// nice slugs are just a subset of all slugs, which must match V4 pattern
	// this slug may be nice or not; we don't know, so use general pattern
	match := RegexpSlugV4.MatchString(slug)
	if !match {
		return "", fmt.Errorf("Invalid slug format: %s", slug)
	}

	// and decode
	return fmt.Sprintf("%s", sluglib.Decode(slug)), nil
}

// encode encodes a uuid into a slug
func encode(uuid string) (string, error) {
	// nice slugs are just a subset of all slugs, which must match V4 pattern
	// this slug may be nice or not; we don't know, so use general pattern
	match := RegexpUUIDV4.MatchString(uuid)
	if !match {
		return "", fmt.Errorf("Invalid uuid format: %s", uuid)
	}

	// the uuid string needs to be parsed into uuidlib.UUID before encoding
	return sluglib.Encode(uuidlib.Parse(uuid)), nil
}
