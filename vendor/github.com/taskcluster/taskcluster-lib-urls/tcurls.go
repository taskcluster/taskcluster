package tcurls

import (
	"fmt"
	"strings"
)

const oldRootURL = "https://taskcluster.net"

// API generates a url for a resource in a taskcluster service
func API(rootURL string, service string, version string, path string) string {
	path = strings.TrimLeft(path, "/")
	switch r := strings.TrimRight(rootURL, "/"); r {
	case oldRootURL:
		return fmt.Sprintf("https://%s.taskcluster.net/%s/%s", service, version, path)
	default:
		return fmt.Sprintf("%s/api/%s/%s/%s", r, service, version, path)
	}
}

// APIReference enerates a url for a taskcluster service reference doc
func APIReference(rootURL string, service string, version string) string {
	switch r := strings.TrimRight(rootURL, "/"); r {
	case oldRootURL:
		return fmt.Sprintf("https://references.taskcluster.net/%s/%s/api.json", service, version)
	default:
		return fmt.Sprintf("%s/references/%s/%s/api.json", r, service, version)
	}
}

// Docs generates a url for a taskcluster docs-site page
func Docs(rootURL string, path string) string {
	path = strings.TrimLeft(path, "/")
	switch r := strings.TrimRight(rootURL, "/"); r {
	case oldRootURL:
		return fmt.Sprintf("https://docs.taskcluster.net/%s", path)
	default:
		return fmt.Sprintf("%s/docs/%s", r, path)
	}
}

// ExchangeReference generates a url for a taskcluster exchange reference doc
func ExchangeReference(rootURL string, service string, version string) string {
	switch r := strings.TrimRight(rootURL, "/"); r {
	case oldRootURL:
		return fmt.Sprintf("https://references.taskcluster.net/%s/%s/exchanges.json", service, version)
	default:
		return fmt.Sprintf("%s/references/%s/%s/exchanges.json", r, service, version)
	}
}

// Schema generates a url for a taskcluster schema
func Schema(rootURL string, service string, name string) string {
	name = strings.TrimLeft(name, "/")
	switch r := strings.TrimRight(rootURL, "/"); r {
	case oldRootURL:
		return fmt.Sprintf("https://schemas.taskcluster.net/%s/%s", service, name)
	default:
		return fmt.Sprintf("%s/schemas/%s/%s", r, service, name)
	}
}

// APIReferenceSchema generates a url for the api reference schema
func APIReferenceSchema(rootURL string, version string) string {
	return Schema(rootURL, "common", fmt.Sprintf("api-reference-%s.json", version))
}

// ExchangesReferenceSchema generates a url for the exchanges reference schema
func ExchangesReferenceSchema(rootURL string, version string) string {
	return Schema(rootURL, "common", fmt.Sprintf("exchanges-reference-%s.json", version))
}

// APIManifestSchema generates a url for the api manifest schema
func APIManifestSchema(rootURL string, version string) string {
	return Schema(rootURL, "common", fmt.Sprintf("manifest-%s.json", version))
}

// MetadataMetaschema generates a url for the metadata metaschema
func MetadataMetaschema(rootURL string) string {
	return Schema(rootURL, "common", "metadata-metaschema.json")
}

// UI generates a url for a page in taskcluster tools site
// The purpose of the function is to switch on rootUrl:
// "The driver for having a ui method is so we can just call ui with a path and any root url,
// and the returned url should work for both our current deployment (with root URL = https://taskcluster.net)
// and any future deployment. The returned value is essentially rootURL == 'https://taskcluster.net'
// ? 'https://tools.taskcluster.net/${path}'
// : '${rootURL}/${path}' "
func UI(rootURL string, path string) string {
	path = strings.TrimLeft(path, "/")
	switch r := strings.TrimRight(rootURL, "/"); r {
	case oldRootURL:
		return fmt.Sprintf("https://tools.taskcluster.net/%s", path)
	default:
		return fmt.Sprintf("%s/%s", r, path)
	}
}

// APIManifest returns a URL for the service manifest of a taskcluster deployment
func APIManifest(rootURL string) string {
	switch r := strings.TrimRight(rootURL, "/"); r {
	case oldRootURL:
		return "https://references.taskcluster.net/manifest.json"
	default:
		return fmt.Sprintf("%s/references/manifest.json", r)
	}
}
