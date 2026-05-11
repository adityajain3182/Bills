import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/index.css';
import { ensureSeed } from './db/seed';
// Importing the sync module registers the scheduler so mutations trigger pushes.
import './sync/sync';

ensureSeed();

const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename || '/'}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
