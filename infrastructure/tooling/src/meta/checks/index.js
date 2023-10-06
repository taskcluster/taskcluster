import url from 'url';
import { loadTasks } from '../../utils/load-tasks.js';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
export const loadChecks = async () => loadTasks(__dirname);
