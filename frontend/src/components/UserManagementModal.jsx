import React, { useState, useEffect, useMemo } from 'react';
import { BACKEND_URL } from '../utils/apiConfig';

/**
 * Modal Quản lý Người dùng cao cấp dành cho Quản trị viên (Admin)
 */
export default function UserManagementModal({ isOpen, onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL'); // 'ALL' | 'ADMIN' | 'MEMBER'
  const [copiedId, setCopiedId] = useState(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/music/admin/users`);
      if (!res.ok) {
        throw new Error('Không thể kết nối máy chủ để tải danh sách tài khoản.');
      }
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      console.error('Lỗi tải danh sách users:', err);
      setError(err.message || 'Có lỗi xảy ra khi nạp danh sách tài khoản.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      setSearchQuery('');
      setRoleFilter('ALL');
    }
  }, [isOpen]);

  // Đếm thống kê
  const stats = useMemo(() => {
    const total = users.length;
    const adminCount = users.filter(
      (u) => u.email === 'admin@nhacoffline.com' || u.user_metadata?.role === 'admin'
    ).length;
    const memberCount = total - adminCount;
    return { total, adminCount, memberCount };
  }, [users]);

  // Lọc người dùng theo từ khóa tìm kiếm và tab vai trò
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const isAdmin = u.email === 'admin@nhacoffline.com' || u.user_metadata?.role === 'admin';
      
      // Lọc vai trò
      if (roleFilter === 'ADMIN' && !isAdmin) return false;
      if (roleFilter === 'MEMBER' && isAdmin) return false;

      // Lọc từ khóa
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const emailMatch = u.email?.toLowerCase().includes(query);
        const idMatch = u.id?.toLowerCase().includes(query);
        const nameMatch = u.user_metadata?.name?.toLowerCase().includes(query);
        return emailMatch || idMatch || nameMatch;
      }

      return true;
    });
  }, [users, searchQuery, roleFilter]);

  if (!isOpen) return null;

  const formatDate = (dateStr) => {
    if (!dateStr) return { date: 'Chưa có', time: '' };
    try {
      const d = new Date(dateStr);
      const date = d.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      const time = d.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return { date, time };
    } catch {
      return { date: dateStr, time: '' };
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="user-management-modal modern" onClick={(e) => e.stopPropagation()}>
        
        {/* Nút đóng góc phải */}
        <button className="auth-close-btn" onClick={onClose} title="Đóng modal">
          ✕
        </button>

        {/* Header Modal */}
        <div className="user-modal-header">
          <div className="user-modal-title-box">
            <div className="user-modal-icon-glow">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
            <div>
              <h3>Quản trị người dùng</h3>
              <p>Hệ thống hiện có <strong>{stats.total}</strong> tài khoản đăng ký lưu trữ đám mây</p>
            </div>
          </div>

          <div className="user-modal-top-actions">
            <button 
              type="button" 
              className={`btn-refresh-users-pill ${loading ? 'spinning' : ''}`}
              onClick={fetchUsers}
              disabled={loading}
              title="Làm mới danh sách người dùng"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
              </svg>
              <span>{loading ? 'Đang đồng bộ...' : 'Làm mới'}</span>
            </button>
          </div>
        </div>

        {/* 3 Thẻ thống kê trực quan */}
        <div className="user-stats-bar">
          <div className="user-stat-card total">
            <div className="stat-card-icon">👥</div>
            <div className="stat-card-info">
              <span className="stat-label">Tổng tài khoản</span>
              <span className="stat-value">{stats.total}</span>
            </div>
          </div>

          <div className="user-stat-card admin">
            <div className="stat-card-icon">👑</div>
            <div className="stat-card-info">
              <span className="stat-label">Quản trị viên (Admin)</span>
              <span className="stat-value gold">{stats.adminCount}</span>
            </div>
          </div>

          <div className="user-stat-card member">
            <div className="stat-card-icon">👤</div>
            <div className="stat-card-info">
              <span className="stat-label">Thành viên thường</span>
              <span className="stat-value green">{stats.memberCount}</span>
            </div>
          </div>
        </div>

        {/* Thanh công cụ tìm kiếm và lọc vai trò */}
        <div className="user-filter-toolbar">
          <div className="user-search-wrapper">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input 
              type="text"
              placeholder="Tìm kiếm theo email, UID người dùng..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="user-search-input"
            />
            {searchQuery && (
              <button 
                type="button" 
                className="user-search-clear" 
                onClick={() => setSearchQuery('')}
                title="Xóa tìm kiếm"
              >
                ✕
              </button>
            )}
          </div>

          <div className="user-role-filter-pills">
            <button 
              type="button" 
              className={`filter-pill ${roleFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setRoleFilter('ALL')}
            >
              Tất cả ({stats.total})
            </button>
            <button 
              type="button" 
              className={`filter-pill admin ${roleFilter === 'ADMIN' ? 'active' : ''}`}
              onClick={() => setRoleFilter('ADMIN')}
            >
              👑 Admin ({stats.adminCount})
            </button>
            <button 
              type="button" 
              className={`filter-pill member ${roleFilter === 'MEMBER' ? 'active' : ''}`}
              onClick={() => setRoleFilter('MEMBER')}
            >
              👤 Thành viên ({stats.memberCount})
            </button>
          </div>
        </div>

        {/* Thông báo lỗi nếu có */}
        {error && (
          <div className="user-alert-box error">
            <span>⚠️ {error}</span>
          </div>
        )}

        {/* Danh sách người dùng dạng Bảng Hiện Đại */}
        <div className="users-table-container">
          {loading && users.length === 0 ? (
            <div className="users-loading-state">
              <div className="custom-spinner"></div>
              <p>Đang đồng bộ dữ liệu tài khoản từ hệ thống Supabase...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="users-empty-state">
              <div className="empty-icon">🔍</div>
              <h4>Không tìm thấy người dùng phù hợp</h4>
              <p>
                {searchQuery 
                  ? `Không có kết quả nào khớp với "${searchQuery}".` 
                  : 'Chưa có người dùng nào trong danh sách này.'}
              </p>
              {searchQuery && (
                <button 
                  type="button" 
                  className="btn-clear-filter"
                  onClick={() => setSearchQuery('')}
                >
                  Xóa từ khóa tìm kiếm
                </button>
              )}
            </div>
          ) : (
            <table className="modern-users-table">
              <thead>
                <tr>
                  <th>Tài khoản & Định danh</th>
                  <th>Vai trò</th>
                  <th>Ngày đăng ký</th>
                  <th>Đăng nhập cuối</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isAdmin = u.email === 'admin@nhacoffline.com' || u.user_metadata?.role === 'admin';
                  const created = formatDate(u.created_at);
                  const lastLogin = formatDate(u.last_sign_in_at);
                  const shortId = u.id ? `${u.id.substring(0, 8)}...${u.id.substring(u.id.length - 4)}` : '';

                  return (
                    <tr key={u.id} className={isAdmin ? 'row-admin' : ''}>
                      {/* Email + Avatar + UID */}
                      <td className="col-user-info">
                        <div className={`modern-avatar ${isAdmin ? 'admin-avatar' : 'member-avatar'}`}>
                          {isAdmin ? '👑' : (u.email ? u.email[0].toUpperCase() : '👤')}
                        </div>
                        <div className="user-details">
                          <div className="user-email-wrap">
                            <span className="user-email-primary">{u.email}</span>
                            {isAdmin && <span className="admin-chip-mini">Chủ tài khoản</span>}
                          </div>
                          <div className="user-id-row">
                            <span className="user-id-code" title={u.id}>UID: {shortId}</span>
                            <button 
                              type="button" 
                              className="btn-copy-uid" 
                              onClick={() => copyToClipboard(u.id, u.id)}
                              title="Sao chép toàn bộ UID"
                            >
                              {copiedId === u.id ? '✓ Đã chép' : 'Sao chép'}
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Vai trò */}
                      <td>
                        <span className={`badge-role ${isAdmin ? 'role-admin' : 'role-member'}`}>
                          {isAdmin ? '👑 Quản trị viên' : '👤 Thành viên'}
                        </span>
                      </td>

                      {/* Ngày đăng ký */}
                      <td>
                        <div className="cell-datetime">
                          <span className="date-main">{created.date}</span>
                          <span className="time-sub">{created.time}</span>
                        </div>
                      </td>

                      {/* Đăng nhập cuối */}
                      <td>
                        {u.last_sign_in_at ? (
                          <div className="cell-datetime">
                            <span className="date-main">{lastLogin.date}</span>
                            <span className="time-sub">{lastLogin.time}</span>
                          </div>
                        ) : (
                          <span className="badge-never-login">Chưa đăng nhập</span>
                        )}
                      </td>

                      {/* Trạng thái */}
                      <td>
                        <div className="status-indicator active">
                          <span className="pulse-dot"></span>
                          <span>Đang hoạt động</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer ghi chú */}
        <div className="user-modal-footer">
          <span>💡 Mỗi tài khoản lưu trữ playlist riêng biệt và tự động đồng bộ trên đám mây Supabase.</span>
          <span className="record-count">Hiển thị {filteredUsers.length} / {stats.total} tài khoản</span>
        </div>

      </div>
    </div>
  );
}
