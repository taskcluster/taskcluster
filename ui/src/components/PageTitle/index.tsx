import { Helmet } from 'react-helmet-async';

/**
 * Update the page's tab title to show a custom string, along with the
 * application name.
 */
export default function PageTitle({ children }: { children?: string }) {
  const { APPLICATION_NAME } = window.env;

  return (
    <Helmet>
      <title>
        {children ? `${children} - ${APPLICATION_NAME}` : APPLICATION_NAME}
      </title>
    </Helmet>
  );
}
