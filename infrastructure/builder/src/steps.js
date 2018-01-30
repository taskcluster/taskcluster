const util = require('util');
const fs = require('fs');
const path = require('path');
const {PassThrough} = require('stream');
const split = require('split');
const rimraf = util.promisify(require('rimraf'));
const git = require('simple-git/promise');
const Docker = require('dockerode');
const config = require('typed-env-config');;
const doT = require('dot');
const {quote} = require('shell-quote');
const Observable = require("zen-observable");
const tar = require('tar-fs');

doT.templateSettings.strip = false;
const ENTRYPOINT_TEMPLATE = doT.template(`
#!/bin/bash
shopt -s nullglob
cd /app
for f in /app/.profile.d/*.sh; do
  source $f
done

case "\${1}" in
  {{~it.procs :proc}}
  {{=proc.name}}) exec bash -c {{=proc.command}};;
  {{~}}
  *) exec "\${@}";;
esac
`.trim());
const DOCKERFILE_TEMPLATE = doT.template(`
FROM {{=it.buildImage}}

ADD app /app
ENV HOME=/app

ADD entrypoint /entrypoint
ENTRYPOINT ["/entrypoint"]
`.trim());

module.exports = class Steps {
  constructor(service, cfg) {
    this.service = service;
    this.cfg = cfg;
    this.workDir = fs.mkdtempSync(path.join('/tmp', service.name + '-'));
    this.git = git(this.workDir);
    this.docker = new Docker();
    this.buildConfig = {
      buildType: 'heroku-buildpack',
      stack: 'heroku-16',
      buildpack: 'https://github.com/heroku/heroku-buildpack-nodejs',
    };
  }

  async clone(ctx) {
    const [source, ref] = this.service.source.split('#');
    await this.git.clone(source, 'app', ['--depth=1', `-b${ref}`]);
    const commit = (await git(path.join(this.workDir, 'app')).revparse(['HEAD'])).trim();
    ctx[this.service.name] = {commit};
  }

  async readConfig() {
    const cfg = config({
      files: [path.join(this.workDir, 'app', '.build-config.sh')],
    }) || {};
    this.buildConfig = Object.assign({}, this.buildConfig, cfg);
  }

  async cloneBuildpack() {
    const [source, ref] = this.buildConfig.buildpack.split('#');
    await this.git.clone(source, 'buildpack', ['--depth=1', `-b${ref || 'master'}`]);
  }

  /**
   * See https://devcenter.heroku.com/articles/buildpack-api and
   * https://devcenter.heroku.com/articles/slug-compiler
   *
   * Note that this is not a general slug compiler; it ignores features
   * that Taskcluster does not use, such as .slugignore.
   */
  async detect() {
    const output = new PassThrough();
    output.pipe(fs.createWriteStream(path.join(this.workDir, 'detect.log')));

    fs.mkdirSync(path.join(this.workDir, 'cache')); // we do not use caching at the moment
    fs.mkdirSync(path.join(this.workDir, 'env'));
    fs.mkdirSync(path.join(this.workDir, 'slug'));

    this.buildImage = `heroku/${this.buildConfig.stack.replace('-', ':')}-build`;

    this.docker.run(
      this.buildImage,
      ['workdir/buildpack/bin/detect', '/workdir/app'],
      output,
      {
        AutoRemove: true,
        Binds: [`${this.workDir}:/workdir`],
      },
    );
    return output.pipe(split(/\r?\n/, null, {trailing: false}));
  }

  async compile() {
    const log = path.join(this.workDir, 'compile.log');
    const output = new PassThrough();
    output.pipe(fs.createWriteStream(log));

    this.docker.run(
      this.buildImage,
      ['/workdir/buildpack/bin/compile', '/workdir/app', '/workdir/cache', '/workdir/env'],
      output,
      {
        AutoRemove: true,
        Binds: [`${this.workDir}:/workdir`],
      },
    );
    return output.pipe(split(/\r?\n/, null, {trailing: false}));
  }

  async entrypoint() {
    const Procfile = fs.readFileSync(path.join(this.workDir, 'app', 'Procfile')).toString();
    const procs = Procfile.split('\n').map(line => {
      if (!line || line.startsWith('#')) {
        return null;
      }
      const [name, command] = line.split(/:?\s+/);
      return {name, command: quote([command.trim()])};
    }).filter(l => l !== null);
    const entrypoint = ENTRYPOINT_TEMPLATE({procs});
    fs.writeFileSync(path.join(this.workDir, 'entrypoint'), entrypoint, {mode: 0o777})
  }

  async buildFinalImage(ctx) {
    fs.mkdirSync(path.join(this.workDir, 'docker'));
    fs.renameSync(path.join(this.workDir, 'app'),path.join(this.workDir, 'docker', 'app'));
    fs.renameSync(path.join(this.workDir, 'entrypoint'),path.join(this.workDir, 'docker', 'entrypoint'));

    const dockerfile = DOCKERFILE_TEMPLATE({buildImage: this.buildImage});
    fs.writeFileSync(path.join(this.workDir, 'docker', 'Dockerfile'), dockerfile);

    const log = path.join(this.workDir, 'build.log');
    let context = await this.docker.buildImage(tar.pack(path.join(this.workDir, 'docker')));
    context.pipe(fs.createWriteStream(log));
    return new Observable(observer => {
      const onFinished = (err, output) => {
        if (err) {
          observer.error(new Error(err));
        }
        observer.complete();
      };
      const onProgress = event => {
        if (event.stream) {
          observer.next(event.stream);
        } else if (event.aux) {
          ctx[this.service.name].image = event.aux.ID.split(':')[1];
        }
      };
      this.docker.modem.followProgress(context, onFinished, onProgress);
    });
  }

  async cleanup() {
    const log = fs.createWriteStream(path.join(this.workDir, 'clean.log'));
    try {
      await this.docker.run(
        this.buildImage,
        ['rm -rf /workdir/app /workdir/slug /workdir/cache /workdir/docker'],
        log,
        {
          AutoRemove: true,
          Binds: [`${this.workDir}:/workdir`],
        },
      );
      await rimraf(this.workDir);
    } catch (err) {
      if (!err.message.trim().endsWith('no such file or directory": unknown')) {
        throw err;
      }
    }
  }
};
