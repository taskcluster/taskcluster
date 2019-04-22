const yaml = require('js-yaml');
const Entity = require('azure-entities');

const WorkerType = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('name'),
  rowKey: Entity.keys.ConstantKey('workerType'),
  properties: {
    // A unique name for this workertype. This maps to a workertype name in tc-queue.
    name: Entity.types.String,

    // Each workertype must choose a single "provider" that will do any provisioning on its behalf
    provider: Entity.types.String,

    // A useful human-readable description of what this workertype is for
    description: Entity.types.String,

    // A timestamp of when this workertype was initially created
    created: Entity.types.Date,

    // A timestamp of when configuration data was last modified. This does not count for things like
    // errors or providerData
    lastModified: Entity.types.Date,

    // The contents of this will be different based on which provider is selected. The providers must
    // provide some sort of schema for this.
    config: Entity.types.JSON,

    // A list of errors that providers have encountered recently when attempting to provision
    // this workertype
    errors: Entity.types.JSON,

    // An email address that gets a notification when there is an error provisioning
    owner: Entity.types.String,

    // Providers can use this to remember values between provisioning runs
    providerData: Entity.types.JSON,
  },
});

WorkerType.prototype.serializable = function() {
  return {
    name: this.name,
    provider: this.provider,
    description: this.description,
    created: this.created.toJSON(),
    lastModified: this.lastModified.toJSON(),
    config: this.config,
    errors: this.errors,
    owner: this.owner,
  };
};

WorkerType.prototype.reportError = async function({kind, title, description, extra, notify, owner}) {
  await this.modify(wt => {
    wt.errors.unshift({
      reported: new Date(),
      kind,
      title,
      description,
      extra,
    });
    wt.errors = wt.errors.slice(0, 100);
  });
  await notify.email({
    address: owner,
    subject: `Taskcluster Worker Manager Error: ${title}`,
    content: `
Worker Manager has encountered an error while trying to provision the workertype ${this.name}:

\`\`\`
${description}
\`\`\`

It includes the extra information:

\`\`\`json
${yaml.safeDump(extra)}
\`\`\`
    `.trim(),
  });
};

module.exports = {
  WorkerType,
};
