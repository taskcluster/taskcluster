package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"

	docopt "github.com/docopt/docopt-go"
	"github.com/pborman/uuid"
	"github.com/taskcluster/slugid-go/slugid"
)

var (
	version = "slug 1.0.0"
	usage   = `
Usage:
  slug [-n|--nice|-r|--v4] [COUNT]
  slug encode [UUID...|-]
  slug decode [SLUGID...|-]
  slug -h|--help
  slug -v|--version

  slug [-n|--nice|-r|--v4] [COUNT]  Generates new slug(s). If -r or --v4 is
                                    provided, regular v4 UUID are used for
                                    generating the slug(s). In all other cases
                                    (-n, --nice, or *no* option) "nice" slugs
                                    are generated. COUNT specifies how many
                                    slugs to generate, default is one. Slugs
                                    are output on separate lines.

  slug decode (-|[SLUGID...])       Outputs the v4 UUID(s) represented by the
                                    given SLUGID(s), or slugid(s) passed via
                                    standard in (one per line) if '-' is
                                    provided. UUID(s) are output one per line,
                                    in the order they were specified. If no
                                    slugids are provided as command line options
                                    or via '-' option, slug generates no output
                                    and exits successfully.

  slug encode (-|[UUID...])         Outputs the SLUGID(s) represented by the
                                    given UUID(s), or UUID(s) passed via
                                    standard in (one per line) if '-' is
                                    provided. SLUGIDs are output one per line,
                                    in the order they were specified. If no
                                    UUIDs are provided as command line options
                                    or via '-' option, slug generates no output
                                    and exits successfully.

  slug -h|--help                    Displays this help page.

  slug -v|--version                 Displays the version of the slug command
                                    line tool.

Slugs are 22 character base64url encoded (RFC 4648) v4 UUIDs (RFC 4122),
stripped of base64 '==' padding.

Slugs serve well as unique identifiers for making remote api calls, in order to
achieve idempotency.

The slug command provides methods for generating new (random) slugs, encoding
v4 UUIDs as slugs, and decoding slugs into v4 UUIDs.

Since slugs are often used as command line options, and may potentially begin
with a '-' character, "nice" slugs can be generated which are like regular UUID
v4 slugs, but restricted to only those which begin [A-Za-f] (where first bit of
UUID is unset). In future releases, "nice" slugs may be further restricted to
fewer permuations in order to be usable in more contexts.

You should consider carefully whether to use regular slugs or "nice" slugs. If
it is more important to have maximum entropy, use regular v4 slugs; however if
your slugs may make it into command line options, better to use "nice" slugs to
avoid intermittent errors. This is especially important if you are providing a
service which supplies slugs to unexpecting tool developers downstream, who may
not realise the risks of using your regular v4 slugs as command line
parameters, especially since problems would arise only as an intermittent issue
(one time in 64 on average).

Generated slugs take the form [A-Za-z0-9_-]{22}, or more precisely:

  * "v4" slugs conform to:
    [A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]

  * "nice" slugs conform to:
    [A-Za-f][A-Za-z0-9_-]{7}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]

All "nice" slugs are also "v4" slugs, since they comprise a strict subset.



Exit Codes:

   0: Success
   1: Unrecognised command line options
  64: Cannot decode invalid slug into a UUID
  65: Problem reading standard input during slug decoding
  66: Cannot encode invalid uuid into a slug
  67: Problem reading standard input during slug encoding
  68: Invalid value passed in for command line option COUNT

Examples:

  $ slug 10
  RDBdHcXuTUq5ghG1wMTArQ
  BwwjV68MS3aQpkJynFZg9w
  QjbIAaOlSK-in5Hveh0T4w
  YGw68ONSR76wruU85RnvjA
  M0eS8zm5RE2qKKURM_1q9g
  ET23t51DSS2c57PA24QQGg
  cu9mg-T6Rem9LuXBdHd9Ig
  OxghknAoS9ORYPocd9HFUg
  Yg6Yei4QQl-iqdZ3udJlLw
  Ek924JDBRGeA6t6PiNz6UQ

  $ slug --v4 2
  -0eS8zm5RE2qKKURM_1q9g
  OxghknAoS9ORYPocd9HFUg

  $ slug decode OxghknAoS9ORYPocd9HFUg SJZbHUBSQLaichv2auLqGQ EChNNJAyS0SeUMlRWCnJ1A
  3b182192-7028-4bd3-9160-fa1c77d1c552
  48965b1d-4052-40b6-a272-1bf66ae2ea19
  10284d34-9032-4b44-9e50-c9515829c9d4

  $ echo 'f47ac10b-58cc-4372-a567-0e02b2c3d479 81d6bb7e-985c-409b-af6c-4721b4a38ec6' \
              | tr ' ' '\n' | slug encode -
  9HrBC1jMQ3KlZw4CssPUeQ
  gda7fphcQJuvbEchtKOOxg

  $ slug 5 | slug decode -
  3405ed8e-e39f-4a3c-a0ea-e107950757f5
  1df41b41-18a2-4d85-bdde-8a73f02a5014
  5fe568dd-6bfd-4f58-8740-17bea665c2ac
  2464a287-7f82-42ad-9b7d-1e26639d569a
  1c936d1b-104c-4abf-97b4-f586371e8742

  $ slug 5 | slug decode - | slug encode -
  WLjW7XpJQ5ePycx6zWF8mw
  dEOJgGpARrWBm9HX9MPBSA
  fBIwjdHdRyGIk5WITyqxqA
  bYuEpq-SQSaZimBDmTe4Kg
  LLY3KZ05QWm0cBS4rfdTaQ
`
)

func main() {

	arguments, err := docopt.Parse(usage, nil, true, version, false, true)
	if err != nil {
		fmt.Println("Error parsing command line arguments!")
		panic(err)
	}

	// fmt.Printf("args: %s\n", arguments)

	// 'slug encode' and 'slug decode' (without further args) can be
	// misinterpreted as being 'slug COUNT'. Don't exit 0 since e.g. 'slug -n
	// encode' should return error, just fix the parsing.
	if c := arguments["COUNT"]; c != nil {
		if c == "encode" || c == "decode" {
			arguments[c.(string)] = true
			arguments["COUNT"] = nil
		}
	}

	switch {
	case arguments["-v"]:
		fmt.Println(version)
	case arguments["decode"]:
		x := arguments["SLUGID"]

		// utility function to handle returning bad exit codes for invalid slugs
		decode := func(slug string) {
			uuid_ := slugid.Decode(slug)
			if uuid_ != nil {
				fmt.Println(uuid_.String())
			} else {
				fmt.Fprintf(os.Stderr, "slug: ERROR: Cannot decode invalid slug '%v' into a UUID\n", slug)
				os.Exit(64)
			}
		}

		if x != nil && len(x.([]string)) == 1 && x.([]string)[0] == "-" || arguments["-"].(bool) {
			scanner := bufio.NewScanner(os.Stdin)
			for scanner.Scan() {
				decode(scanner.Text())
			}
			if err := scanner.Err(); err != nil {
				fmt.Fprintln(os.Stderr, "slug: ERROR: Problem reading standard input during slug decoding:", err)
				os.Exit(65)
			}
			return
		}
		for _, slug := range x.([]string) {
			decode(slug)
		}
	case arguments["encode"]:
		x := arguments["UUID"]

		// utility function to handle returning bad exit codes for invalid uuids
		encode := func(uuidStr string) {
			uuid_ := uuid.Parse(uuidStr)
			if uuid_ != nil {
				slug := slugid.Encode(uuid_)
				fmt.Println(slug)
			} else {
				fmt.Fprintf(os.Stderr, "slug: ERROR: Cannot encode invalid uuid '%v' into a slug\n", uuidStr)
				os.Exit(66)
			}
		}

		if x != nil && len(x.([]string)) == 1 && x.([]string)[0] == "-" || arguments["-"].(bool) {
			scanner := bufio.NewScanner(os.Stdin)
			for scanner.Scan() {
				encode(scanner.Text())
			}
			if err := scanner.Err(); err != nil {
				fmt.Fprintln(os.Stderr, "slug: ERROR: Problem reading standard input during slug encoding:", err)
				os.Exit(67)
			}
			return
		}
		for _, slug := range x.([]string) {
			encode(slug)
		}
	default:
		count := 1
		if c := arguments["COUNT"]; c != nil {
			var err error = nil
			count, err = strconv.Atoi(c.(string))
			if err != nil {
				fmt.Fprintf(os.Stderr, "slug: ERROR: Invalid value '%v' passed in for command line option COUNT, since COUNT must be a number. Run `slug --help` for more details.\n", c)
				os.Exit(68)
			}
			// it is not possible for count < 0 since tokens beginning with '-'
			// are treated as command line options and failure would have
			// occured, therefore we do not need to handle this failure case
		}
		var generator func() string
		switch {
		case arguments["-r"], arguments["--v4"]:
			generator = slugid.V4
		default:
			generator = slugid.Nice
		}
		for i := 0; i < count; i++ {
			fmt.Println(generator())
		}
	}
}
