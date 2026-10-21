import React, { useState } from 'react';

/**
 * Component hiển thị danh sách bài hát:
 * 1. 🎧 Đã nghe từ SoundCloud: Toàn bộ bài hát được đồng bộ từ SoundCloud (kể cả tự động qua Extension)
 * 2. 🎵 Playlist của tôi: Danh sách bài hát cá nhân mà người dùng yêu thích/chọn lựa
 */
export default function Playlist({ 
  tracks = [], 
  soundcloudTracks = [],
  currentTrackIndex, 
  activePlaylistType = 'soundcloud',
  onSelectTrack, 
  cachedUrls = new Set(),
  onAddToMyPlaylist,
  onRemoveTrack,
  isAdmin = false,
  user = null,
  onRequireAuth,
  isOnline = true,
  downloadingUrls = new Set()
}) {
  const [activeTab, setActiveTab] = useState('soundcloud');
  const [noticeMessage, setNoticeMessage] = useState(null);

  // Format giây thành phút:giây (ví dụ: 195s -> 03:15)
  const formatTime = (secs) => {
    if (!secs || isNaN(secs)) return '--:--';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Format dung lượng
  const formatSize = (secs, serverFormattedSize) => {
    if (serverFormattedSize && serverFormattedSize !== '-- MB') {
      return serverFormattedSize;
    }
    if (!secs || isNaN(secs) || secs <= 0) return null;
    const bytes = secs * 16000;
    if (bytes > 48 * 1024 * 1024) {
      return '~43 MB (Nén)';
    }
    return `~${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ⚡ QUAN TRỌNG THEO YÊU CẦU: Nếu người dùng chưa đăng nhập, KHÔNG hiển thị danh sách bài hát
  if (!user) {
    return (
      <section className="playlist-section">
        <div className="empty-state auth-required-empty">
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🔒</div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
            Bạn chưa đăng nhập
          </h3>
          <p style={{ color: 'var(--text-sub)', fontSize: '0.88rem', maxWidth: '380px', margin: '0 auto 18px auto', lineHeight: 1.5 }}>
            Vui lòng đăng nhập tài khoản để xem danh sách bài hát và tự động đồng bộ bài hát khi nghe trên SoundCloud.
          </p>
          {onRequireAuth && (
            <button 
              type="button" 
              className="btn-add-all-admin" 
              style={{ padding: '8px 24px', fontSize: '0.9rem' }}
              onClick={onRequireAuth}
            >
              Đăng nhập / Đăng ký ngay
            </button>
          )}
        </div>
      </section>
    );
  }

  const displayedList = activeTab === 'soundcloud' ? soundcloudTracks : tracks;

  return (
    <section className="playlist-section">
      <div className="playlist-header-tabs">
        <div className="tabs-group">
          <button 
            type="button" 
            className={`tab-btn ${activeTab === 'soundcloud' ? 'active' : ''}`}
            onClick={() => setActiveTab('soundcloud')}
          >
            🎧 Đã nghe từ SoundCloud ({soundcloudTracks.length})
          </button>
          <button 
            type="button" 
            className={`tab-btn ${activeTab === 'my' ? 'active' : ''}`}
            onClick={() => setActiveTab('my')}
          >
            🎵 Playlist của tôi ({tracks.length})
          </button>
        </div>
      </div>

      {/* Thông báo hướng dẫn người dùng thêm bài vào Playlist */}
      {noticeMessage && (
        <div className="playlist-require-notice">
          {noticeMessage}
        </div>
      )}

      {displayedList.length === 0 ? (
        <div className="empty-state">
          {activeTab === 'soundcloud' ? (
            <div>
              <p>Chưa có bài hát nào được đồng bộ từ SoundCloud.</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)', marginTop: '6px' }}>
                💡 Hãy mở SoundCloud lên nghe bài hát bạn thích, Tiện ích Extension sẽ tự động nạp bài hát vào đây!
              </p>
            </div>
          ) : (
            <div>
              <p>Chưa có bài hát nào trong playlist của bạn.</p>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-sub)', marginTop: '4px' }}>
                Hãy chuyển sang tab "🎧 Đã nghe từ SoundCloud" để bấm "+ Thêm" bài hát yêu thích vào Playlist của bạn.
              </p>
              {soundcloudTracks.length > 0 && onAddToMyPlaylist && (
                <button 
                  type="button" 
                  className="btn-add-all-admin"
                  onClick={() => soundcloudTracks.forEach(t => onAddToMyPlaylist(t))}
                >
                  ⚡ Nhập tất cả {soundcloudTracks.length} bài hát từ SoundCloud vào Playlist
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="track-list">
          {displayedList.map((track, index) => {
            const isPlayingThis = activePlaylistType === activeTab && index === currentTrackIndex;
            const sizeStr = formatSize(track.durationSeconds, track.formattedSize);
            const isAlreadyInMyList = tracks.some(t => t.supabaseUrl === track.supabaseUrl);
            const cleanTrackUrl = track.supabaseUrl ? track.supabaseUrl.split('?')[0] : '';
            const isCached = cachedUrls.has(cleanTrackUrl);
            const isDownloading = downloadingUrls.has(cleanTrackUrl);

            return (
              <div
                key={track.id || track.supabaseUrl || index}
                className={`track-item ${isPlayingThis ? 'active' : ''}`}
              >
                {/* Phần click phát nhạc (Có thể nghe trực tiếp khi có mạng, nhưng khi Offline chỉ nghe được bài đã thêm vào Playlist) */}
                <div 
                  className="track-main-click"
                  onClick={() => {
                    // Nếu đang Offline mà bài này ở tab SoundCloud và chưa được thêm vào Playlist cá nhân
                    if (!isOnline && activeTab === 'soundcloud' && !isAlreadyInMyList) {
                      setNoticeMessage(`⚠️ Bạn đang Offline: Bài "${track.title}" chưa được thêm vào Playlist của bạn nên không thể nghe khi mất mạng. Hãy chuyển sang tab "🎵 Playlist của tôi" để nghe các bài đã lưu nhé!`);
                      setTimeout(() => setNoticeMessage(null), 4000);
                      return;
                    }
                    onSelectTrack(index, true, activeTab);
                  }}
                  title={!isOnline && activeTab === 'soundcloud' && !isAlreadyInMyList ? "Chưa thêm vào Playlist - Không thể nghe khi Offline" : "Click để phát bài này"}
                >
                  <img
                    src={track.coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&q=80'}
                    alt={track.title}
                    className="track-cover"
                    onError={(e) => {
                      e.target.src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&q=80';
                    }}
                  />

                  <div className="track-info">
                    <div className="track-title">{track.title}</div>
                    <div className="track-artist">{track.artist || 'Nghệ sĩ SoundCloud'}</div>
                  </div>
                </div>

                {/* Thời lượng và Nút thao tác */}
                <div className="track-badges">

                  {/* Trạng thái tải Offline đối với Playlist cá nhân */}
                  {activeTab === 'my' && (
                    <span className="track-offline-status" style={{ fontSize: '0.78rem', marginRight: '4px' }}>
                      {isCached ? (
                        <span style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '3px' }} title="Đã lưu vào bộ nhớ máy, sẵn sàng nghe khi mất mạng!">
                          ⚡ Sẵn sàng Offline
                        </span>
                      ) : isDownloading ? (
                        <span style={{ color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: '3px' }} title="Đang tải dữ liệu bài hát vào máy...">
                          ⏳ Đang tải...
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-sub)' }} title="Đang chờ nạp vào bộ nhớ máy">
                          ☁️ Chờ tải
                        </span>
                      )}
                    </span>
                  )}

                  <span className="track-time-size">
                    {formatTime(track.durationSeconds)}
                    {sizeStr && (
                      <span className="track-size-badge" title="Dung lượng file">
                        • 💾 {sizeStr}
                      </span>
                    )}
                  </span>

                  {/* Nút thêm vào Playlist cá nhân để nghe Offline */}
                  {activeTab === 'soundcloud' && onAddToMyPlaylist && (
                    <button
                      type="button"
                      disabled={isDownloading}
                      className={`btn-action-track ${isAlreadyInMyList ? 'added' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isAlreadyInMyList && !isDownloading) {
                          onAddToMyPlaylist(track);
                          setNoticeMessage(`⏳ Đang tải "${track.title}" vào máy để nghe Offline... Vui lòng đợi trong giây lát!`);
                          setTimeout(() => setNoticeMessage(null), 4000);
                        }
                      }}
                      title={isCached ? 'Đã lưu trong máy (Nghe Offline tốt)' : isDownloading ? 'Đang tải về máy...' : isAlreadyInMyList ? 'Đã có trong Playlist' : 'Bấm để thêm vào Playlist và lưu nghe Offline'}
                    >
                      {isDownloading ? '⏳ Đang tải...' : isCached ? '✓ Đã có' : isAlreadyInMyList ? '✓ Đã có' : '+ Thêm'}
                    </button>
                  )}

                  {/* Nút xóa bài: ở Playlist cá nhân HOẶC ở Kho SoundCloud nếu là Admin */}
                  {(activeTab === 'my' || (isAdmin && activeTab === 'soundcloud')) && onRemoveTrack && (
                    <button
                      type="button"
                      className="btn-remove-track"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveTrack(track, activeTab === 'soundcloud');
                      }}
                      title={activeTab === 'soundcloud' ? "Xóa vĩnh viễn khỏi Kho Supabase" : "Gỡ khỏi Playlist cá nhân"}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
