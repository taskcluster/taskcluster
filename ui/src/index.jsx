import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import routes from './App/routes';
import Link from './utils/Link';

Link.setRoutes(routes);

createRoot(document.getElementById('root')).render(<App routes={routes} />);
