package slugid

import (
	"fmt"
	"os"
	"regexp"

	uuidlib "github.com/pborman/uuid"
	sluglib "github.com/taskcluster/slugid-go/slugid"
	"github.com/taskcluster/taskcluster-cli/extpoints"
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

	// validation
	match, err := regexp.MatchString("^[A-Za-z0-9-_]{22}$", slug)
	if err != nil || match == false {
		var errmsg string
		errmsg += fmt.Sprintf("Invalid slug format: %s", slug)

		if err != nil {
			errmsg += fmt.Sprintf("\nError message: %s", err)
		}

		return "", fmt.Errorf(errmsg)
	}

	// and decode
	return fmt.Sprintf("%s", sluglib.Decode(slug)), nil
}

// encodes uuid into a slug
func encode(context extpoints.Context) (string, error) {
	uuid := context.Arguments["<uuid>"].(string)

	// validation
	match, err := regexp.MatchString("^[a-f0-9]{8}-([a-f0-9]{4}-){3}[a-f0-9]{12}$", uuid)
	if err != nil || match == false {
		var errmsg string
		errmsg += fmt.Sprintf("Invalid uuid format: %s", uuid)

		if err != nil {
			errmsg += fmt.Sprintf("\nError message: %s", err)
		}

		return "", fmt.Errorf(errmsg)
	}

	// the uuid string needs to be parsed into uuidlib.UUID before encoding
	return sluglib.Encode(uuidlib.Parse(uuid)), nil
}
