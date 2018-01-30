const fs = require('fs');
const config = require('typed-env-config');
const ON_DEATH = require('death');
const Listr = require('listr');
const stringify = require('json-stable-stringify');
const Steps = require('./steps');

// This is being used a shell trap
const CLEAN_STEPS = [];
ON_DEATH((signal, err) => {
  CLEAN_STEPS.forEach(step => {
    step();
  });
  err && console.error(err);
  process.exit(signal);
});

const main = async () => {
  const cfg = config({
    files: ['services.yml'],
  });
  const lockFile = JSON.parse(fs.readFileSync('services.lock'));
  const context = {};

  const imageBuilder = new Listr(
    cfg.services.map(service => {
      const steps = new Steps(service, cfg, lockFile[service.name], context);
      CLEAN_STEPS.push(steps.cleanup);
      return {
        title: service.name,
        skip: () => steps.shouldBuild(),
        task: () => new Listr([
          {
            title: 'Clone service repo',
            task: () => steps.clone(),
          },
          {
            title: 'Gather build configuration',
            task: () => steps.readConfig(),
          },
          {
            title: 'Clone buildpack repo',
            task: () => steps.cloneBuildpack(),
          },
          {
            title: 'Detect',
            task: () => steps.detect(),
          },
          {
            title: 'Compile',
            task: () => steps.compile(),
          },
          {
            title: 'Generate entrypoint',
            task: () => steps.entrypoint(),
          },
          {
            title: 'Build image',
            task: () => steps.buildFinalImage(),
          },
          {
            title: 'Clean',
            task: () => steps.cleanup(),
          },
        ])
      };
    }),
    {concurrent: 1}
  );

  await imageBuilder.run();
  fs.writeFileSync('services.lock', stringify(context, {space: 4}));
};

main().catch(console.error);
