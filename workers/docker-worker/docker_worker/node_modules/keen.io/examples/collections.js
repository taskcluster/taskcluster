var keen = require('../index.js');

var keen = keen.configure({
    projectId: "<project_id>",
    writeKey: "<write_key>",
    readKey: "<read_key>",
    masterKey: "<master_key>"
});
var collection = '<event_collection>';

// Get collection schema
keen.collections.view(projectId, collection, function(err, res) {
	console.log('collection.view', err, res);
});

// Removes collection
// This is irreversible and will only work for collections under 10k events.
keen.collections.remove(projectId, collection, function(err, res) {
	console.log('collection.remove', err, res);
});
