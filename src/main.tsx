import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      fetch('/sw.js', { method: 'HEAD', redirect: 'manual' })
        .then((res) => {
          if (res.ok && !res.redirected && res.type !== 'opaqueredirect') {
            return navigator.serviceWorker.register('/sw.js');
          }
          return undefined;
        })
        .catch(() => {
          // Skip ServiceWorker registration when proxy redirects or blocks /sw.js
        });
    });
  } else {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(
          registrations
            .filter((reg) => reg.active?.scriptURL.includes('dev-sw.js') || reg.installing?.scriptURL.includes('dev-sw.js'))
            .map((reg) => reg.unregister()),
        ),
      )
      .catch(() => {});
  }
}
