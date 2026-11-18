// Keep in sync with generate-env-js.js.
interface Window {
  env: {
    APPLICATION_NAME: string;
    TASKCLUSTER_ROOT_URL: string;
    SUBSCRIPTION_ENDPOINT: string;
    DOCS_ONLY: string | false;
    UI_LOGIN_STRATEGY_NAMES: string;
    SENTRY_DSN: string;
    BANNER_MESSAGE: string;
    // Keep in sync with ui/docs/manual/deploying/ui.mdx
    SITE_SPECIFIC: {
      github_app_url?: string;
      tutorial_worker_pool_id?: string;
      tutorial_worker_schema?: string;
      notify_email_sender?: string;
      notify_matrix_bot_name?: string;
      notify_slack_bot_name?: string;
      cloud_credentials_docs_url?: string;
    };
  };
}
