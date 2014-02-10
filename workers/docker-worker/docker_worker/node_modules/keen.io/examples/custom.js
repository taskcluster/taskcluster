var keen = require("../index.js");

var keen = keen.configure({
  projectId: "<project_id>",
  writeKey: "<write_key>",
  readKey: "<read_key>",
  masterKey: "<master_key>"
});
var args = {
  event_collection: "<event_collection>",
  target_property: "<target_property>"
};

keen.request("get", "read", "queries/count", args, function(err, res) {
  if (err) return console.error(err);

  console.dir(res);
});
