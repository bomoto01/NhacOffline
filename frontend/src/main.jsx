import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Đăng ký Service Worker cho Progressive Web App (PWA) & Offline Audio Caching
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[PWA] Service Worker đăng ký thành công với scope:', registration.scope);
        // Tự động kiểm tra và kích hoạt ngay Service Worker phiên bản mới nhất
        registration.update();
      })
      .catch((error) => {
        console.error('[PWA] Đăng ký Service Worker thất bại:', error);
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
