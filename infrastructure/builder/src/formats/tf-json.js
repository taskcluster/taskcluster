const assert = require('assert');

/**
 * A TerraformJson file represents the output of the build process,
 * in a format that can be consumed by Terraform.  It is a JSON
 * file with the shape {"locals": ..locals..}. The embedded object's
 * values must all be strings, to suit Terraform's bizarre data
 * structures.
 */

class TerraformJson {
  /**
   * Construct a new TerraformJson from The context output of the build process.
   */
  constructor(buildContext) {
    this.buildContext = buildContext;
  }

  write() {
    const locals = {};
    const context = this.buildContext;

    locals['taskcluster_image_monoimage'] = context['monoimage-docker-image'];

    console.log(JSON.stringify({locals}, null, 2));
  }
}

exports.TerraformJson = TerraformJson;
