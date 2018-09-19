import { withRootUrl } from 'taskcluster-lib-urls';

export default withRootUrl(`https://${process.env.TASKCLUSTER_ROOT_URL}`);
