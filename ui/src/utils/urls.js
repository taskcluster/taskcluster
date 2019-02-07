import { withRootUrl } from 'taskcluster-lib-urls';

export default withRootUrl(process.env.TASKCLUSTER_ROOT_URL);
