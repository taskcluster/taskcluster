package mocktc

import (
	"fmt"

	"github.com/taskcluster/httpbackoff/v3"
	tcclient "github.com/taskcluster/taskcluster/v96/clients/client-go"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcsecrets"
)

type Secrets struct {
	// map from secret name to secret value
	Secrets map[string]*tcsecrets.Secret
}

func NewSecrets() *Secrets {
	return &Secrets{
		Secrets: map[string]*tcsecrets.Secret{},
	}
}

func (s *Secrets) Ping() error {
	// nothing to do
	return nil
}

func (s *Secrets) List(continuationToken, limit string) (*tcsecrets.SecretsList, error) {
	names := []string{}
	for name := range s.Secrets {
		names = append(names, name)
	}
	return &tcsecrets.SecretsList{
		Secrets: names,
	}, nil
}

func (s *Secrets) Get(name string) (*tcsecrets.Secret, error) {
	if sec, exists := s.Secrets[name]; exists {
		return sec, nil
	}
	return nil, &tcclient.APICallException{
		CallSummary: &tcclient.CallSummary{
			HTTPResponseBody: fmt.Sprintf("Secret %v not found - cannot return value", name),
		},
		RootCause: httpbackoff.BadHttpResponseCode{
			HttpResponseCode: 404,
		},
	}
}

func (s *Secrets) Set(name string, payload *tcsecrets.Secret) error {
	s.Secrets[name] = payload
	return nil
}

func (s *Secrets) Remove(name string) error {
	if _, exists := s.Secrets[name]; exists {
		delete(s.Secrets, name)
		return nil
	}
	return &tcclient.APICallException{
		CallSummary: &tcclient.CallSummary{
			HTTPResponseBody: fmt.Sprintf("Secret %v not found - cannot remove", name),
		},
		RootCause: httpbackoff.BadHttpResponseCode{
			HttpResponseCode: 404,
		},
	}
}
