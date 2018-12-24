const fs = require('fs');
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
   * Construct a new TerraformJson from a clusterSpec and the
   * context output of the build process.
   */
  constructor(clusterSpec, buildContext) {
    this.clusterSpec = clusterSpec;
    this.buildContext = buildContext;
  }

  write(filename) {
    const locals = {};
    const context = this.buildContext;

    this.clusterSpec.build.repositories.forEach(r => {
      if (r.kind === 'service') {
        const img = context[`service-${r.name}-docker-image`];
        assert(img, `no image found for repository ${r.name}`);
        locals[`taskcluster_image_${r.name}`] = img;
      }
    });

    fs.writeFileSync(filename, JSON.stringify({locals}, null, 2));
  }
}

exports.TerraformJson = TerraformJson;
