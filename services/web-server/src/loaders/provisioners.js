import DataLoader from 'dataloader';
import sift from 'sift';
import ConnectionLoader from '../ConnectionLoader';

export default ({ queue }) => {
  const provisioner = new DataLoader(provisionerIds =>
    Promise.all(
      provisionerIds.map(async provisionerId =>
        queue.getProvisioner(provisionerId)
      )
    )
  );
  const provisioners = new ConnectionLoader(async ({ options, filter }) => {
    const raw = await queue.listProvisioners(options);
    const provisioners = filter
      ? sift(filter, raw.provisioners)
      : raw.provisioners;

    return { ...raw, items: provisioners };
  });

  return {
    provisioner,
    provisioners,
  };
};
