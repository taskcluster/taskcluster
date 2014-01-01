/**
Dump wrapper around docker.run so it can be used with a promise based api.
*/
function run(
  docker,
  image,
  cmd,
  streamo,
  callback
) {
  docker.run(
    image,
    cmd,
    streamo,
    false,
    function(err, result, container) {
      if (err) return callback(err);
      callback(null, {
        result: result,
        container: container
      });
    }
  );
}

module.exports = run;
