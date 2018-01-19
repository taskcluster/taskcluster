const assert = require('assert');
const taskDefinition = require('./fixtures/task');
const Monitor = require('taskcluster-lib-monitor');
const artifactLinkTransform = require('../src/transform/artifact_links');

let monitor;

suite('artifact link transform', () => {
  suiteSetup(async () => {
    monitor = await Monitor({
      project: 'tc-treeherder-test',
      credentials: {},
      mock: true,
    });
  });

  test('artifact link added', async () => {
    let links = ['foo'];
    let expectedLink = {
      label: 'artifact uploaded',
      linkText: 'test.log',
      url: 'https://queue.taskcluster.net/v1/task/123/runs/0/artifacts/public/test.log',
    };
    let job = {
      jobInfo: {
        links: links,
      },
    };
    let queue = {
      listArtifacts: () => {
        return {artifacts: [{name: 'public/test.log'}]};
      },
    };

    job = await artifactLinkTransform(queue, monitor, '123', 0, job);
    links.push(expectedLink);

    assert.deepEqual(links, job.jobInfo.links);
  });

  test('artifacts with same basename', async () => {
    let expectedLinks = [
      {
        label: 'artifact uploaded',
        linkText: 'test.log',
        url: 'https://queue.taskcluster.net/v1/task/123/runs/0/artifacts/public/test.log',
      },
      {
        label: 'artifact uploaded',
        linkText: 'test.log (1)',
        url: 'https://queue.taskcluster.net/v1/task/123/runs/0/artifacts/public/test/test.log',
      },
    ];
    let job = {
      jobInfo: {
        links: [],
      },
    };
    let queue = {
      listArtifacts: () => {
        return {
          artifacts: [
            {name: 'public/test.log'},
            {name: 'public/test/test.log'},
          ]};
      },
    };

    job = await artifactLinkTransform(queue, monitor, '123', 0, job);
    assert.deepEqual(expectedLinks, job.jobInfo.links);
  });

  test('artifacts with continuation token', async () => {
    let expectedLinks = [
      {
        label: 'artifact uploaded',
        linkText: 'test.log',
        url: 'https://queue.taskcluster.net/v1/task/123/runs/0/artifacts/public/test.log',
      },
      {
        label: 'artifact uploaded',
        linkText: 'fatal.log',
        url: 'https://queue.taskcluster.net/v1/task/123/runs/0/artifacts/public/fatal.log',
      },
    ];
    let job = {
      jobInfo: {
        links: [],
      },
    };
    let attempt = 0;
    let artifacts = [
      {name: 'public/test.log'},
      {name: 'public/fatal.log'},
    ];
    let queue = {
      listArtifacts: () => {
        let artifact = [artifacts[attempt]];
        let token = attempt === 0 ? 'token' : undefined;
        attempt += 1;
        return {
          artifacts: artifact,
          continuationToken: token,
        };
      },
    };

    job = await artifactLinkTransform(queue, monitor, '123', 0, job);
    assert.deepEqual(expectedLinks, job.jobInfo.links);
  });

  test('error retrieving artifacts', async () => {
    let links = ['foo'];
    let job = {
      jobInfo: {
        links: links,
      },
    };
    let queue = {
      listArtifacts: () => { throw new Error('bad things happened'); },
    };

    job = await artifactLinkTransform(queue, monitor, '123', 0, job);
    assert.deepEqual(links, job.jobInfo.links);
  });
});
