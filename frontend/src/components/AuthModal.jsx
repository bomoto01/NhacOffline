import React, { useState } from 'react';

export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (isLogin) {
        // Đăng nhập qua Backend API an toàn
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password: password }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.msg || data.error_description || data.message || 'Email hoặc mật khẩu không chính xác.');
        }

        // Lưu session vào localStorage
        localStorage.setItem('nhacoffline_auth_session', JSON.stringify(data));
        setSuccessMsg('Đăng nhập thành công!');
        if (onAuthSuccess) onAuthSuccess(data.user);
        setTimeout(() => onClose(), 600);
      } else {
        // Đăng ký qua Backend API an toàn
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password: password }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.msg || data.error_description || data.message || 'Đăng ký tài khoản thất bại.');
        }

        if (data.access_token || data.user) {
          localStorage.setItem('nhacoffline_auth_session', JSON.stringify(data));
        }
        setSuccessMsg('Đăng ký tài khoản thành công! Đang tự động đăng nhập...');
        if (onAuthSuccess) onAuthSuccess(data.user || data);
        setTimeout(() => onClose(), 800);
      }
    } catch (err) {
      console.error('Lỗi xác thực:', err);
      let message = err.message || 'Có lỗi xảy ra, vui lòng thử lại.';
      if (message.includes('Invalid login credentials')) {
        message = 'Email hoặc mật khẩu không chính xác.';
      } else if (
        message.includes('User already registered') || 
        message.includes('already been registered') || 
        message.includes('email_exists')
      ) {
        message = 'Email này đã được đăng ký. Vui lòng chuyển sang Đăng nhập.';
      } else if (message.includes('Password should be at least') || message.includes('ít nhất 6 ký tự')) {
        message = 'Mật khẩu phải có ít nhất 6 ký tự.';
      }
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <button className="auth-close-btn" onClick={onClose} title="Đóng">✕</button>

        <div className="auth-header">
          <div className="auth-icon-badge">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          </div>
          <h3>{isLogin ? 'Đăng nhập tài khoản' : 'Tạo tài khoản mới'}</h3>
          <p>Lưu playlist riêng biệt, đồng bộ đa thiết bị và nghe offline mọi lúc mọi nơi.</p>
        </div>

        {/* Chuyển đổi tab Đăng nhập / Đăng ký */}
        <div className="auth-tabs">
          <button 
            type="button" 
            className={`auth-tab ${isLogin ? 'active' : ''}`}
            onClick={() => { setIsLogin(true); setErrorMsg(null); setSuccessMsg(null); }}
          >
            Đăng nhập
          </button>
          <button 
            type="button" 
            className={`auth-tab ${!isLogin ? 'active' : ''}`}
            onClick={() => { setIsLogin(false); setErrorMsg(null); setSuccessMsg(null); }}
          >
            Đăng ký
          </button>
        </div>

        {errorMsg && (
          <div className="alert-box alert-error auth-alert">
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="alert-box alert-success auth-alert">
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="input-group">
            <label>Địa chỉ Email</label>
            <input 
              type="email" 
              required 
              placeholder="VD: user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="input-group">
            <label>Mật khẩu (tối thiểu 6 ký tự)</label>
            <input 
              type="password" 
              required 
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <button type="submit" className="btn-auth-submit" disabled={loading}>
            {loading ? (
              <span className="spinner-small"></span>
            ) : isLogin ? (
              'Đăng nhập ngay'
            ) : (
              'Tạo tài khoản'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
