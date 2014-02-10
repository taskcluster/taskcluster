var keen = require('../index.js');

var keen = keen.configure({
	projectId: "<project_id>",
	writeKey: "<write_key>"
});

// Construct same events
var events = [
	{
		collection: 'test',
		data: {
			name: 'Fred',
			age: 30
		},
		keen: {
			timestamp: new Date(0) // overwrite the recorded keen timestamp
		}
	},
	{
		collection: 'test',
		data: {
			name: 'John',
			age: 40
		}
	},
	{
		collection: 'test2',
		data: {
			name: 'John Smith',
			age: 20
		}
	}
];
// Send events to project
keen.addEvents(events, function(err, res) {
	console.log('events.insert', err, res);
});