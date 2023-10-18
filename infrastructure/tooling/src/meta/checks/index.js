import { loadTasks } from '../../utils/load-tasks.js';

const __dirname = new URL('.', import.meta.url).pathname;
export const loadChecks = async () => loadTasks(__dirname);
