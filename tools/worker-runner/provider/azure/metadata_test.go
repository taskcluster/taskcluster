package azure

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

type fakeMetadataService struct {
	InstanceDataError     error
	InstanceData          *InstanceData
	ScheduledEventsError  error
	ScheduledEvents       *ScheduledEvents
	AttestedDocumentError error
	AttestedDocument      string
	LoadCustomDataError   error
	CustomData            []byte
}

func (mds *fakeMetadataService) queryInstanceData() (*InstanceData, error) {
	if mds.InstanceDataError != nil {
		return nil, mds.InstanceDataError
	}
	return mds.InstanceData, nil
}

func (mds *fakeMetadataService) queryScheduledEvents() (*ScheduledEvents, error) {
	if mds.ScheduledEventsError != nil {
		return nil, mds.ScheduledEventsError
	}
	return mds.ScheduledEvents, nil
}

func (mds *fakeMetadataService) queryAttestedDocument() (string, error) {
	if mds.AttestedDocumentError != nil {
		return "", mds.AttestedDocumentError
	}
	return mds.AttestedDocument, nil
}

func testServer() *httptest.Server {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()
		apiVersion := query["api-version"][0]

		if r.Header.Get("Metadata") != "true" {
			w.WriteHeader(400)
			fmt.Fprintf(w, "No metadata header")
			return
		}

		if r.URL.Path == "/metadata/instance" {
			if apiVersion != "2019-08-15" {
				w.WriteHeader(400)
				fmt.Fprintf(w, "Bad API version")
				return
			}
			w.WriteHeader(200)
			fmt.Fprintln(w, `{
				"compute": {
					"customData": "Y3VzdG9t",
					"location": "eastus",
					"vmId": "df09142e-c0dd-43d9-a515-489f19829dfd",
					"vmSize": "Standard_D2s_v3"
				},
				"network": {
					"interface": [{
						"ipv4": {
							"ipAddress": [{
								"privateIpAddress": "10.11.12.13",
								"publicIpAddress": "9.10.11.12"
							}]
						}
					}]
				}
			}`)
			return
		}
		if r.URL.Path == "/metadata/scheduledevents" {
			if apiVersion != "2017-11-01" { // note: different from other endpoints!
				w.WriteHeader(400)
				fmt.Fprintf(w, "Bad API version")
				return
			}
			w.WriteHeader(200)
			fmt.Fprintln(w, `{
			  "DocumentIncarnation": 1,
			  "Events": [
				{
				  "EventId": "77213DA4-3EBD-4C87-970D-949767E6DB59",
				  "EventStatus": "Scheduled",
				  "EventType": "Reboot",
				  "ResourceType": "VirtualMachine",
				  "Resources": [
					"dustin-dw-testing"
				  ],
				  "NotBefore": "Thu, 05 Dec 2019 00:31:50 GMT"
				}
			  ]
			}`)
			return
		}

		if r.URL.Path == "/metadata/attested/document" {
			if apiVersion != "2019-08-15" {
				w.WriteHeader(400)
				fmt.Fprintf(w, "Bad API version")
				return
			}
			w.WriteHeader(200)
			fmt.Fprintln(w, `{
				"encoding": "pkcs7",
				"signature": "SSBzb2xlbW5seSBzd2VhciBJIGFtIHVwIHRvIG5vIGdvb2Q="
			}`)
			return
		}

		w.WriteHeader(404)
		fmt.Fprintf(w, "Not Found: %s", r.URL.Path)
	}))

	return ts
}

func TestQueryInstanceData(t *testing.T) {
	ts := testServer()
	defer ts.Close()

	MetadataBaseURL = ts.URL
	defer func() {
		MetadataBaseURL = "http://169.254.169.254"
	}()

	ms := realMetadataService{}

	id, err := ms.queryInstanceData()
	require.NoError(t, err)
	require.Equal(t, "eastus", id.Compute.Location)
	require.Equal(t, "10.11.12.13", id.Network.Interface[0].IPV4.IPAddress[0].PrivateIPAddress)
	require.Equal(t, "9.10.11.12", id.Network.Interface[0].IPV4.IPAddress[0].PublicIPAddress)
}

func TestQueryAttestedDocument(t *testing.T) {
	ts := testServer()
	defer ts.Close()

	MetadataBaseURL = ts.URL
	defer func() {
		MetadataBaseURL = "http://169.254.169.254"
	}()

	ms := realMetadataService{}

	doc, err := ms.queryAttestedDocument()
	require.NoError(t, err)
	require.Equal(t, "SSBzb2xlbW5seSBzd2VhciBJIGFtIHVwIHRvIG5vIGdvb2Q=", doc)
}

func TestQueryScheduledEvents(t *testing.T) {
	ts := testServer()
	defer ts.Close()

	MetadataBaseURL = ts.URL
	defer func() {
		MetadataBaseURL = "http://169.254.169.254"
	}()

	ms := realMetadataService{}

	evts, err := ms.queryScheduledEvents()
	require.NoError(t, err)
	require.Equal(t, "77213DA4-3EBD-4C87-970D-949767E6DB59", evts.Events[0].EventId)
	require.Equal(t, "Scheduled", evts.Events[0].EventStatus)
	require.Equal(t, "Reboot", evts.Events[0].EventType)
	require.Equal(t, "VirtualMachine", evts.Events[0].ResourceType)
	require.Equal(t, []string{"dustin-dw-testing"}, evts.Events[0].Resources)
	require.Equal(t, "Thu, 05 Dec 2019 00:31:50 GMT", evts.Events[0].NotBefore)
}
