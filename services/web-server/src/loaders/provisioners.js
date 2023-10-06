import DataLoader from 'dataloader';
import sift from '../utils/sift';
import ConnectionLoader from '../ConnectionLoader';

export default ({ queue }, isAuthed, rootUrl, monitor, strategies, req, cfg, requestId) => {
  const provisioner = new DataLoader(provisionerIds =>
    Promise.all(
      provisionerIds.map(async provisionerId => {
        try {
          return await queue.getProvisioner(provisionerId);
        } catch (err) {
          return err;
        }
      }),
    ),
  );
  const provisioners = new ConnectionLoader(async ({ options, filter }) => {
    const raw = await queue.listProvisioners(options);
    const provisioners = sift(filter, raw.provisioners);

    return { ...raw, items: provisioners };
  });

  return {
    provisioner,
    provisioners,
  };
};
