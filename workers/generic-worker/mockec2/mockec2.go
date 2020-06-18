package mockec2

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/taskcluster/taskcluster/v31/workers/generic-worker/gwconfig"
)

type Metadata struct {
	Document         func() interface{}
	Signature        string
	AMIID            string
	AvailabilityZone string
	InstanceType     string
	InstanceID       string
	PublicHostname   string
	LocalIPv4        net.IP
	PublicIPv4       net.IP
	UserData         func() interface{}
	Terminating      bool
	WorkerConfig     map[string]interface{}
}

func (ec2 *Metadata) RegisterService(r *mux.Router) {
	metadata := map[string]interface{}{
		"/latest/dynamic/instance-identity/signature":   ec2.Signature,
		"/latest/meta-data/ami-id":                      ec2.AMIID,
		"/latest/meta-data/placement/availability-zone": ec2.AvailabilityZone,
		"/latest/meta-data/instance-type":               ec2.InstanceType,
		"/latest/meta-data/instance-id":                 ec2.InstanceID,
		"/latest/meta-data/public-hostname":             ec2.PublicHostname,
		"/latest/meta-data/local-ipv4":                  ec2.LocalIPv4,
		"/latest/meta-data/public-ipv4":                 ec2.PublicIPv4,
	}

	JSONor400 := func(data func() interface{}) func(w http.ResponseWriter, r *http.Request) {
		return func(w http.ResponseWriter, r *http.Request) {
			bytes, err := json.Marshal(data())
			if err != nil {
				w.WriteHeader(400)
				return
			}
			_, _ = w.Write(bytes)
		}
	}

	Sprintf := func(data func() interface{}) func(w http.ResponseWriter, r *http.Request) {
		return func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte(fmt.Sprintf("%v", data())))
		}
	}

	for i := range metadata {
		r.HandleFunc(i, Sprintf(
			func(i string) func() interface{} {
				return func() interface{} {
					return metadata[i]
				}
			}(i),
		)).Methods("GET")
	}
	r.HandleFunc("/latest/meta-data/spot/termination-time", ec2.TerminationTime).Methods("GET")
	r.HandleFunc("/latest/user-data", JSONor400(ec2.UserData)).Methods("GET")
	r.HandleFunc("/latest/dynamic/instance-identity/document", JSONor400(ec2.Document)).Methods("GET")
}

func New(publicConfig *gwconfig.PublicConfig, providerID string, publicFiles map[string]interface{}) *Metadata {
	m := &Metadata{
		Signature:        "test-signature",
		AMIID:            "test-ami",
		AvailabilityZone: "outer-space",
		InstanceType:     "p3.teenyweeny",
		InstanceID:       "test-instance-id",
		PublicHostname:   "MadamaButterfly",
		LocalIPv4:        net.IPv4(87, 65, 43, 21),
		PublicIPv4:       net.IPv4(12, 34, 56, 78),
	}
	gwconf := map[string]interface{}{
		"config": publicConfig,
	}
	if publicFiles != nil {
		gwconf["files"] = publicFiles
	}
	m.WorkerConfig = map[string]interface{}{
		"genericWorker": gwconf,
	}
	m.UserData = func() interface{} {
		return map[string]interface{}{
			"workerPoolId": publicConfig.ProvisionerID + "/" + publicConfig.WorkerType,
			"providerId":   providerID,
			"workerGroup":  publicConfig.WorkerGroup,
			"rootUrl":      publicConfig.RootURL,
			"workerConfig": m.WorkerConfig,
		}
	}
	m.Document = func() interface{} {
		return map[string]interface{}{
			"availabilityZone": "outer-space",
			"privateIp":        "87.65.43.21",
			"version":          "2017-09-30",
			"instanceId":       "test-worker-id",
			"instanceType":     "p3.teenyweeny",
			"accountId":        "123456789012",
			"imageId":          "test-ami",
			"pendingTime":      "2016-11-19T16:32:11Z",
			"architecture":     "x86_64",
			"region":           "quadrant-4",
		}
	}
	return m
}

func (ec2 *Metadata) TerminationTime(w http.ResponseWriter, r *http.Request) {
	if ec2.Terminating {
		fmt.Fprint(w, "time to die")
	} else {
		w.WriteHeader(404)
	}
}
