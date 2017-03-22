import assert from 'assert';
import * as settings from '../settings';
import TestWorker from '../testworker';
import DockerWorker from '../dockerworker';
import cmd from './helper/cmd';
import waitForEvent from '../../build/lib/wait_for_event';

suite('device linking within containers', () => {

  let worker;

  setup(async () => {
    settings.cleanup();
  });

  teardown(async() => {
    settings.cleanup();
    if (worker) {
      await worker.terminate();
      worker = null;
    }
  });

  test('link valid video loopback device', async () => {
    worker = new TestWorker(DockerWorker);
    await worker.launch();
    let task = {
      scopes: ['docker-worker:capability:device:loopbackVideo'],
      payload: {
        capabilities: {
          devices: {
            loopbackVideo: true
          }
        },
        image: 'ubuntu:14.10',
        command: cmd(
          'ls /dev',
          'test -c /dev/video0 || { echo \'Device not found\' ; exit 1; }'
        ),
        maxRunTime: 5 * 60
      }
    };

    let result = await worker.postToQueue(task);

    assert.equal(result.status.state, 'completed', 'Task state is not marked as completed');
    assert.equal(
      result.run.reasonResolved,
      'completed',
      'Task not resolved as complete'
    );
  });

  test('link valid audio loopback device', async () => {
    worker = new TestWorker(DockerWorker);
    await worker.launch();
    let task = {
      scopes: ['docker-worker:capability:device:loopbackAudio'],
      payload: {
        capabilities: {
          devices: {
            loopbackAudio: true
          }
        },
        image: 'ubuntu:14.10',
        command: cmd(
          'ls /dev/snd',
          'test -c /dev/snd/controlC0 -a \
          -c /dev/snd/pcmC0D0c -a \
          -c /dev/snd/pcmC0D0p -a \
          -c /dev/snd/pcmC0D1c -a \
          -c /dev/snd/pcmC0D1p \
          || { echo \'Devices not found\' ; exit 1; }'
        ),
        maxRunTime: 5 * 60
      }
    };

    let result = await worker.postToQueue(task);

    assert.equal(result.status.state, 'completed', 'Task state is not marked as completed');
    assert.equal(
      result.run.reasonResolved,
      'completed',
      'Task not resolved as complete'
    );
  });

  test('task failed when all scopes not specified', async () => {
    worker = new TestWorker(DockerWorker);
    await worker.launch();
    let task = {
      scopes: ['docker-worker:capability:device:loopbackVideo'],
      payload: {
        capabilities: {
          devices: {
            loopbackVideo: true,
            loopbackAudio: true
          }
        },
        image: 'ubuntu:14.10',
        command: cmd(
          'ls /dev',
          'test -c /dev/video0 || { echo \'Device not found\' ; exit 1; }'
        ),
        maxRunTime: 5 * 60
      }
    };

    let result = await worker.postToQueue(task);

    assert.equal(result.status.state, 'failed', 'Task state is not marked as failed');
    assert.equal(
      result.run.reasonResolved,
      'failed',
      'Task not resolved as failed'
    );

    assert.ok(
      result.log.indexOf('Insufficient scopes to attach devices') !== -1,
      'Error for insufficient scopes does not appear in the logs'
    );
  });

  test('host capacity adjusted when device capacity is less than worker capacity', async () => {
    // XXX: This could change, right now the vagrant image has 8 video devices, and 30 audio
    // Adjusted running capacity should be the lowest device capacity, 8 in this case.
    settings.configure({
      capacity: 50,
      deviceManagement: {
        loopbackAudio: {
          enabled: true
        },
        loopbackVideo: {
          enabled: true
        }
      }
    });

    worker = new TestWorker(DockerWorker);
    await worker.launch();
    let task = {
      scopes: ['docker-worker:capability:device:loopbackVideo'],
      payload: {
        capabilities: {
          devices: {
            loopbackVideo: true
          }
        },
        image: 'ubuntu:14.10',
        command: cmd('ls /dev'),
        maxRunTime: 5 * 60
      }
    };

    let result = await Promise.all([
      worker.postToQueue(task),
      waitForEvent(worker, '[info] host capacity adjusted')
    ]);

    assert.equal(result[0].status.state, 'completed', 'Task state is not marked as completed');
    assert.equal(
      result[0].run.reasonResolved,
      'completed',
      'Task not resolved as complete'
    );

    assert.ok(
      result[1].message.includes('Adjusted Host Capacity: 8'),
      'Worker should just capacity based on the number of devices that could be found'
    );
  });
});
