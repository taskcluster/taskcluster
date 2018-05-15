const testing = require('taskcluster-lib-testing');
const path = require('path');

suite('validate', function() {
  testing.schemas({
    validator: {
      prefix: 'hooks/v1/',
    },
    basePath: path.join(__dirname, 'validate_test'),
    schemaPrefix: 'http://schemas.taskcluster.net/',
    cases: [
      {
        schema: 'hooks/v1/create-hook-request.json',
        path: 'create-hook-request.json',
        success: true,
      },
      {
        schema: 'hooks/v1/schedule.json',
        path: 'schedule-none.json',
        success: true,
      },
      {
        schema: 'hooks/v1/schedule.json',
        path: 'schedule-daily.json',
        success: true,
      },
      {
        schema: 'hooks/v1/schedule.json',
        path: 'schedule-weekly.json',
        success: true,
      },
      {
        schema: 'hooks/v1/schedule.json',
        path: 'schedule-weekday.json',
        success: true,
      },
      {
        schema: 'hooks/v1/schedule.json',
        path: 'schedule-monthly.json',
        success: true,
      },
      {
        schema: 'hooks/v1/schedule.json',
        path: 'schedule-biweekly.json',
        success: true,
      },
    ],
  });
});
