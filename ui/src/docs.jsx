import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import routes from './App/docsRoutes';
import Link from './utils/Link';

Link.setRoutes(routes);

const root = createRoot(document.getElementById('root'));

root.render(<App routes={routes} />);
