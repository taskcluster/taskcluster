var keen = require('../index.js');

var keen = keen.configure({
    projectId: "<project_id>",
    readKey: "<read_key>"
});
var projectId = '<project_id>';
var collection = '<event_collection>';
var property = '<property_name>';

/*
// Not Yet Implemented

keen.queries.list(projectId, function(err, res) {
	console.log('queries.list', err, res);
});

keen.queries.perform(projectId, collection, 'count', {}, function(err, res) {
	console.log('queries.perform', err, res);
});

keen.queries.extraction(projectId, collection, {}, function(err, res) {
	console.log('queries.extraction', err, res);
});

keen.queries.funnel();

keen.queries.saved.list();

keen.queries.saved.view();

keen.queries.saved.insert();

keen.queries.saved.remove();

keen.queries.saved.results();

*/