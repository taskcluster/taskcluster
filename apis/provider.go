package apis

import (
	"fmt"
	"io"
	"strings"

	"github.com/taskcluster/taskcluster-cli/apis/definitions"
	"github.com/taskcluster/taskcluster-cli/extpoints"
)

type apiProvider struct {
	definitions.Service
	Name string
}

func (p apiProvider) ConfigOptions() map[string]extpoints.ConfigOption {
	return map[string]extpoints.ConfigOption{
		"baseUrl": extpoints.ConfigOption{
			Default: p.BaseURL,
			Env:     "TASKCLUSTER_QUEUE_BASE_URL",
			Validate: func(value interface{}) error {
				return nil
			},
		},
	}
}

func (p apiProvider) Summary() string {
	return "Operate on the " + p.Name + " service"
}

func pad(s string, length int) string {
	p := length - len(s)
	if p < 0 {
		p = 0
	}
	return s + strings.Repeat(" ", p)
}

func (p apiProvider) Usage() string {
	query := []string{}
	usage := p.Title + "\n\n"
	usage += "Usage:\n"
	for _, e := range p.Entries {
		args := ""
		for _, arg := range e.Args {
			args += " <" + arg + ">"
		}
		usage += fmt.Sprintf("  taskcluster %s [options] %s", p.Name, e.Name)
		if args != "" {
			usage += " [--]" + args
		}
		for _, q := range e.Query {
			usage += fmt.Sprintf(" [--%s <%s>]", q, q)
			// Add q to opts, if not already in the list
			unique := true
			for _, o := range query {
				if o == q {
					unique = false
				}
			}
			if unique {
				query = append(query, q)
			}
		}
		if e.Input != "" {
			usage += " <payload>"
		}
		usage += "\n"
	}
	usage += fmt.Sprintf("  taskcluster %s help <method>", p.Name)
	usage += "\n\n"
	usage += "Options:\n"
	opts := [][]string{
		[]string{"-o, --output <output>", "Output file [default: -]"},
		[]string{"-b, --base-url <baseUrl>", fmt.Sprintf("BaseUrl for %s [default: %s]", p.Name, p.BaseURL)},
		[]string{"-d, --dry-run", "Validate input again schema without making a request"},
	}
	for _, opt := range query {
		opts = append(opts, []string{
			"    --" + opt + " <" + opt + ">",
			"Specify the '" + opt + "' query-string parameter",
		})
	}
	// Find max option size to align all options
	maxSize := 0
	for _, opt := range opts {
		if len(opt[0]) > maxSize {
			maxSize = len(opt[0])
		}
	}
	for _, opt := range opts {
		usage += "  " + pad(opt[0], maxSize+2) + opt[1] + "\n"
	}
	usage += "\n"
	usage += p.Description
	usage += "\n"

	return usage
}

func (p apiProvider) Execute(context extpoints.Context) bool {
	argv := context.Arguments

	// Find then entry if possible
	var entry *definitions.Entry
	for _, e := range p.Entries {
		if argv[e.Name] == true {
			entry = &e
		}
	}
	// Print help information about the end-point
	if entry == nil {
		if argv["help"] == true {
			// Print help
		} else {
			// Internal error
			panic("Unknown command, internal error!")
		}
	} else {

	}

	fmt.Println("-----------------")
	fmt.Printf("%+v\n", entry)
	for _, arg := range entry.Args {
		fmt.Printf("  %s = %s\n", arg, argv["<"+arg+">"])
	}
	fmt.Println("-----------------")

	for k, v := range argv {
		if v != false {
			fmt.Printf("%s = %#v\n", k, v)
		}
	}

	return true
}

func (p apiProvider) help(entry *definitions.Entry) {

}

func (p apiProvider) dryrun(entry *definitions.Entry, args, query map[string]string, payload io.Reader, output io.Writer) {

}

func (p apiProvider) execute(baseURL string, entry *definitions.Entry, args, query map[string]string, payload io.Reader, output io.Writer) {

}
