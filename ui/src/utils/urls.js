import { withRootUrl } from 'taskcluster-lib-urls';

export default withRootUrl(window.env.TASKCLUSTER_ROOT_URL);
