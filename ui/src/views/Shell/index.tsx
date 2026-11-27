import { useLocation } from 'react-router-dom';
import Dashboard from '../../components/Dashboard';
import ShellConsole from '../../components/Shell';

export default function Shell() {
  const search = new URLSearchParams(useLocation().search);

  return (
    <Dashboard
      disableAppbar
      disablePadding
      style={{ position: 'relative' }}
      title="Shell">
      <ShellConsole
        url={search.get('socketUrl') ?? ''}
        taskId={search.get('taskId') ?? ''}
        version={search.get('v') ?? ''}
      />
    </Dashboard>
  );
}
