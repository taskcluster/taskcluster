import DockerAPI from 'dockerode-promise';
import dockerOpts from 'dockerode-options';

export default class Docker extends DockerAPI {
  constructor() {
    super(dockerOpts);
  }
}
