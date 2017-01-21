package slugid

import (
	"fmt"
	"os"
	"regexp"

	"github.com/taskcluster/taskcluster-cli/extpoints"
	sluglib "github.com/taskcluster/slugid-go/slugid"
	uuidlib "github.com/pborman/uuid"
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

	// what function was called?
	if args["v4"] == true {
		v4()
	} else if args["nice"] == true {
		nice()
	} else if args["decode"] == true { // decode slug
		return decode(context)
	} else if args["encode"] == true { // encode slug
		return encode(context)
	}
	// ...and docopt will react to unrecognized commands

	return true
}

// normal v4 uuid generation
func v4() {
	fmt.Println(sluglib.V4())
}

// generates uuid with "nice" properties
func nice() {
	fmt.Println(sluglib.Nice())
}

// decodes slug into a uuid
func decode(context extpoints.Context) bool {
	slug := context.Arguments["<slug>"].(string)

	// validation
	match, err := regexp.MatchString("^[A-Za-z0-9-_]{22}$", slug)
	if err != nil || match == false {
		fmt.Fprintf(os.Stderr, "Invalid slug format: %s\n", slug)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error message: %s\n", err)
		}
		return false
	}

	// and decode
	fmt.Println(sluglib.Decode(slug))

	return true
}

// encodes uuid into a slug
func encode(context extpoints.Context) bool {
	uuid := context.Arguments["<uuid>"].(string)

	// validation
	match, err := regexp.MatchString("^[a-f0-9]{8}-([a-f0-9]{4}-){3}[a-f0-9]{12}$", uuid)
	if err != nil || match == false {
		fmt.Fprintf(os.Stderr, "Invalid uuid format: %s\n", uuid)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error message: %s\n", err)
		}
		return false
	}

	// the uuid string needs to be parsed into uuidlib.UUID before encoding
	fmt.Println(sluglib.Encode(uuidlib.Parse(uuid)))

	return true
}
