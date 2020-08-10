const _ = require('lodash');

exports.k8sResources = async ({ userConfig, answer, configTmpl }) => {
  function setDefault(path, val) {
    if (!_.has(userConfig, path, val)) {
      _.set(userConfig, path, val);
    }
  }

  // ensure that each proc has a value for `cpu`, defaulting to the values in
  // dev-config-example.yml instead of those in the default Helm values, as
  // the example defaults are suitable for a (mostly idle) dev environment.
  for (const [name, cfg] of Object.entries(configTmpl)) {
    if (!cfg.procs) {
      continue;
    }
    for (const [proc, { cpu }] of Object.entries(configTmpl[name].procs)) {
      setDefault(`${name}.procs.${proc}.cpu`, cpu);
    }
  }

  return userConfig;
};
