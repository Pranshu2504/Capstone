/**
 * Web entry point. The native build enters through index.js/AppRegistry;
 * this mounts the very same <App /> into the DOM via react-native-web.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppRegistry } from 'react-native';

import App from './App';

AppRegistry.registerComponent('ZORA', () => App);

const container = document.getElementById('root');
if (!container) throw new Error('Root container #root is missing from index.html');

// Clear the pre-hydration splash before React takes the node over.
container.innerHTML = '';

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
