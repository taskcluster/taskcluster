package main

import (
	"encoding/hex"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/Sirupsen/logrus"
	raven "github.com/getsentry/raven-go"
	"github.com/pborman/uuid"
	"github.com/taskcluster/statsum"
	tcauth "github.com/taskcluster/taskcluster-client-go/auth"
)

// NewMonitor creates a new monitor
func NewMonitor(project string, auth *tcauth.Auth, logLevel string, tags map[string]string) (m *Monitor) {
	// Create statsumConfigurer
	statsumConfigurer := func(project string) (statsum.Config, error) {
		res, err := auth.StatsumToken(project)
		if err != nil {
			return statsum.Config{}, err
		}
		return statsum.Config{
			Project: res.Project,
			BaseURL: res.BaseURL,
			Token:   res.Token,
			Expires: time.Time(res.Expires),
		}, nil
	}

	// Create logger and parse logLevel
	logger := logrus.New()
	switch strings.ToLower(logLevel) {
	case logrus.DebugLevel.String():
		logger.Level = logrus.DebugLevel
	case logrus.InfoLevel.String():
		logger.Level = logrus.InfoLevel
	case logrus.WarnLevel.String():
		logger.Level = logrus.WarnLevel
	case logrus.ErrorLevel.String():
		logger.Level = logrus.ErrorLevel
	case logrus.FatalLevel.String():
		logger.Level = logrus.FatalLevel
	case logrus.PanicLevel.String():
		logger.Level = logrus.PanicLevel
	default:
		panic(fmt.Sprintf("Unsupported log-level: %s", logLevel))
	}

	// Convert tags to logrus.Fields
	fields := make(logrus.Fields, len(tags))
	for k, v := range tags {
		fields[k] = v
	}

	// Declare monitor so we can reference it in OnError
	m = &Monitor{
		Statsum: statsum.New(project, statsumConfigurer, statsum.Options{
			OnError: func(err error) { m.ReportWarning(err) },
		}),
		Entry: logrus.NewEntry(logger).WithFields(fields),
		sentry: &sentry{
			client:  nil,
			project: project,
			auth:    auth,
		},
	}

	return
}

type sentry struct {
	client     *raven.Client
	m          sync.Mutex
	project    string
	expiration time.Time
	auth       *tcauth.Auth
}

func (s *sentry) Client() (*raven.Client, error) {
	s.m.Lock()
	defer s.m.Unlock()

	// Refresh sentry DSN if necessary
	if s.expiration.Before(time.Now()) {
		// Fetch DSN
		res, err := s.auth.SentryDSN(s.project)
		if err != nil {
			return nil, err
		}
		// Create or update DSN for the client
		if s.client == nil {
			s.client, err = raven.New(res.Dsn.Secret)
		} else {
			err = s.client.SetDSN(res.Dsn.Secret)
		}
		if err != nil {
			return nil, err
		}
		// Set expiration, so we remember to refresh
		s.expiration = time.Time(res.Expires)
	}

	return s.client, nil
}

// A Monitor is responsible for collecting logs, stats and error messages.
//
// A monitor is a context aware object for monitoring. That is to say that a
// Monitor is used to record metrics, write logs and report errors. When doing
// so the Monitor object adds meta-data to the metrics, logs and errors. The
// meta-data added is context dependent tags and prefix. These help identify
// where a log message, metric or error originates from.
//
// When passing a Monitor to a sub-component it often makes sense to add
// additional tags or prefix. This way a downloader function that takes a
// Monitor need not worry about being able to distinguish its metrics, logs and
// errors from that of its parent.
//
// Prefixes should always be constants, such as engine, feature, function or
// component names. Values that change such as taskId or runId should not be
// used as prefixes, such values is however great as tags.
//
// All metrics reported for a given prefix + name will be aggregated. Hence, if
// taskId was used as prefix, the dimensionality of metrics would explode and
// the aggregation wouldn't be useful.
type Monitor struct {
	*statsum.Statsum
	*logrus.Entry
	*sentry
	tags   map[string]string
	prefix string
}

// Time measure time of fn in statsum
func (m *Monitor) Time(name string, fn func()) {
	m.Statsum.Time(name, fn)
}

func (m *Monitor) CapturePanic(fn func()) (incidentID string) {
	defer func() {
		if crash := recover(); crash != nil {
			message := fmt.Sprint(crash)
			id := uuid.NewRandom()
			incidentID = id.String()
			m.Entry.WithField("incidentId", incidentID).WithField("panic", crash).Error("Recovered from panic:\n " + message)
			m.submitError(fmt.Errorf("PANIC: %s", message), fmt.Sprint("Recovered from panic ", message), raven.ERROR, id, 1)
		}
	}()
	fn()
	return
}

func (m *Monitor) ReportError(err error, message ...interface{}) string {
	incidentID := uuid.NewRandom()
	m.Entry.WithField("incidentId", incidentID.String()).WithError(err).Error(message...)
	m.submitError(err, fmt.Sprint(message...), raven.ERROR, incidentID, 1)
	return incidentID.String()
}

func (m *Monitor) ReportWarning(err error, message ...interface{}) string {
	incidentID := uuid.NewRandom()
	m.Entry.WithField("incidentId", incidentID.String()).WithError(err).Warn(message...)
	m.submitError(err, fmt.Sprint(message...), raven.WARNING, incidentID, 1)
	return incidentID.String()
}

// Report error/warning to sentry and write to log, returns incidentId which
// can be included in task-logs, if relevant.
func (m *Monitor) submitError(err error, message string, level raven.Severity, incidentID uuid.UUID, skipFrames int) {
	// Capture stack trace
	exception := raven.NewException(err, raven.NewStacktrace(1+skipFrames, 5, []string{
		"github.com/taskcluster/",
	}))

	// Create error packet
	text := fmt.Sprintf("Error: %s\nMessage: %s", err.Error(), message)
	packet := raven.NewPacket(text, nil, exception)
	packet.Level = level
	packet.EventID = hex.EncodeToString(incidentID)

	// Add incidentID and prefix to tags
	tags := make(map[string]string, len(m.tags)+2)
	for tag, value := range m.tags {
		tags[tag] = value
	}
	tags["incidentId"] = incidentID.String()
	tags["prefix"] = m.prefix

	// Get client with fresh sentry DSN (if cached is old)
	client, rerr := m.sentry.Client()
	if rerr != nil {
		m.Error("Failed to obtain sentry DSN, error: ", rerr)
		m.Error("Failed to send error: ", err)
		return
	}

	// Send packet
	_, done := client.Capture(packet, tags)
	<-done
}

// WithTags create child monitor with given tags (tags don't apply to statsum)
func (m *Monitor) WithTags(tags map[string]string) *Monitor {
	// Merge tags from monitor and tags
	allTags := make(map[string]string, len(m.tags)+len(tags))
	for k, v := range m.tags {
		allTags[k] = v
	}
	for k, v := range tags {
		allTags[k] = v
	}
	// Construct fields for logrus (just satisfiying the type system)
	fields := make(map[string]interface{}, len(allTags))
	for k, v := range allTags {
		fields[k] = v
	}
	fields["prefix"] = m.prefix // don't allow overwrite "prefix"
	return &Monitor{
		Statsum: m.Statsum,
		Entry:   m.Entry.WithFields(fields),
		sentry:  m.sentry,
		tags:    allTags,
		prefix:  m.prefix,
	}
}

// WithTag creates child monitor with given tag
func (m *Monitor) WithTag(key, value string) *Monitor {
	return m.WithTags(map[string]string{key: value})
}

// WithPrefix creates child monitor with given prefix (prefix applies to everything)
func (m *Monitor) WithPrefix(prefix string) *Monitor {
	completePrefix := prefix
	if m.prefix != "" {
		completePrefix = m.prefix + "." + prefix
	}
	return &Monitor{
		Statsum: m.Statsum.WithPrefix(prefix),
		Entry:   m.Entry.WithField("prefix", completePrefix),
		sentry:  m.sentry,
		tags:    m.tags,
		prefix:  completePrefix,
	}
}
