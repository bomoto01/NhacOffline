// Cấu hình địa chỉ máy chủ Cloud (Render.com)
// Giúp Frontend trên Vercel tự động kết nối thẳng tới Render Backend 24/7
export const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'https://nhacoffline.onrender.com').replace(/\/+$/, '');
