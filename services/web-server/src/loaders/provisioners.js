import DataLoader from 'dataloader';
import ConnectionLoader from '../ConnectionLoader.js';

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
  const provisioners = new ConnectionLoader(async ({ options }) => {
    const raw = await queue.listProvisioners(options);

    return { ...raw, items: raw.provisioners };
  });

  return {
    provisioner,
    provisioners,
  };
};
