const path = require("path");
const libUrls = require("taskcluster-lib-urls");
const got = require("got");
const { listServices, readRepoYAML } = require("../../utils");

const SERVICES = listServices();

exports.scopeExpression = { AllOf: [] };
exports.tasks = [];

// TODO: add for web-server once Dockerflow APIs are created for it
SERVICES.filter((name) => name !== "web-server").forEach((name) => {
  exports.tasks.push({
    title: `__lbheartbeat__ endpoint for ${name}`,
    requires: [],
    provides: [`lbheartbeat-${name}`],
    run: async (requirements, utils) => {
      const procs = await readRepoYAML(
        path.join("services", name, "procs.yml"),
      );

      let checked = false;

      for (const proc of Object.values(procs)) {
        if (proc.type === "web") {
          const healthcheck = libUrls.api(
            process.env.TASKCLUSTER_ROOT_URL,
            name,
            "v1",
            "__lbheartbeat__",
          );
          const resp = await got.get(healthcheck);

          // For now we just check statuscode because lbheartbeat doesn't return
          // anything useful anyway and web-server doesn't even return json.
          if (resp.statusCode !== 200) {
            throw new Error(`${name} is not responding`);
          }
          checked = true;
        }
      }

      if (!checked) {
        return utils.skip({
          reason: "No exposed web service",
        });
      }
    },
  });

  exports.tasks.push({
    title: `__heartbeat__ endpoint for ${name}`,
    requires: [],
    provides: [`heartbeat-${name}`],
    run: async (requirements, utils) => {
      const procs = await readRepoYAML(
        path.join("services", name, "procs.yml"),
      );

      let checked = false;

      for (const proc of Object.values(procs)) {
        if (proc.type === "web") {
          const healthcheck = libUrls.api(
            process.env.TASKCLUSTER_ROOT_URL,
            name,
            "v1",
            "__heartbeat__",
          );
          const resp = await got.get(healthcheck);

          // For now we just check statuscode because heartbeat doesn't return
          // anything useful anyway and web-server doesn't even return json.
          if (resp.statusCode !== 200) {
            throw new Error(`${name} is not responding`);
          }
          checked = true;
        }
      }

      if (!checked) {
        return utils.skip({
          reason: "No exposed web service",
        });
      }
    },
  });

  exports.tasks.push({
    title: `__version__ endpoint for ${name}`,
    requires: [],
    provides: [`version-${name}`],
    run: async (requirements, utils) => {
      const procs = await readRepoYAML(
        path.join("services", name, "procs.yml"),
      );

      let checked = false;

      for (const proc of Object.values(procs)) {
        if (proc.type === "web") {
          const dunderVersion = libUrls.api(
            process.env.TASKCLUSTER_ROOT_URL,
            name,
            "v1",
            "__version__",
          );
          const resp = await got(dunderVersion, { throwHttpErrors: true });

          try {
            JSON.parse(resp.body);
            checked = true;
          } catch (err) {
            throw new Error("__version__ did not return valid JSON");
          }
        }
      }

      if (!checked) {
        return utils.skip({
          reason: "No exposed web service",
        });
      }
    },
  });
});

// TODO: add for web-server once Dockerflow APIs are created for it
exports.tasks.push({
  title: `Dockerflow API endpoints succeed (--target dockerflow)`,
  requires: [
    ...SERVICES.filter((name) => name !== "web-server").flatMap((name) => [
      `lbheartbeat-${name}`,
      `heartbeat-${name}`,
      `version-${name}`,
    ]),
  ],
  provides: [`target-dockerflow`],
  run: async (requirements, utils) => {},
});
