/**
Scope and validation abstraction over a single docker image name.
*/
var scopeMatch = require('taskcluster-base/utils').scopeMatch;
var parseImage = require('docker-image-parser');

function Image(image) {
  var parsed = parseImage(image);
  this.name = parsed.repository;
  this.tag = parsed.tag;
}

Image.prototype = {
  name: null,
  tag: null,

  /**
  Return full image path including tag.
  */
  fullPath: function() {
    return this.name + (this.tag ? ':' + this.tag : '');
  },

  /**
  Determine if we should attempt to authenticate against this image name... The
  image will not be considered something to authenticate against unless it has
  three parts: <host>/<user>/<image>. Note this does not mean you cannot
  authenticate against docker you just need to prefix the default path with:
  `registry.hub.docker.com`.

  @return {Boolean}
  */
  canAuthenticate: function() {
    var components = this.name.split('/').filter(function(part) {
      // strip empty parts...
      return !!part;
    });
    return components.length === 3;
  },

  /**
  Attempt to find credentials from within an object of repositories.

  @return {Object|null} credentials or null...
  */
  credentials: function(repositories) {
    // We expect the image to be be checked via imageCanAuthenticate first.
    var parts = this.name.split('/');
    var registryHost = parts[0];
    var registryUser = parts[1];
    var result;

    // Note this may search through all repositories intentionally as to only
    // match the correct (longest match based on slashes).
    for (var registry in repositories) {

      // Longest possible match always wins fast path return...
      if (registryHost + '/' + registryUser === registry) {
        return repositories[registry];
      }

      // Hold on to partial matches but we cannot use these as the final values
      // without exhausting all options...
      if (registryHost + '/' === registry || registryHost == registry) {
        result = repositories[registry];
      }
    }

    return result;
  }
};

module.exports = Image;
