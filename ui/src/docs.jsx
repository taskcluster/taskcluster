import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import routes from './App/docsRoutes';
import { setLinkRoutes } from './utils/linkRoutes';

setLinkRoutes(routes);

createRoot(document.getElementById('root')).render(<App routes={routes} />);
