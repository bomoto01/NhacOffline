import React, { useState, useEffect } from 'react';
import SoundCloudForm from './components/SoundCloudForm';
import Playlist from './components/Playlist';
import AudioPlayer from './components/AudioPlayer';
import AuthModal from './components/AuthModal';
import UserManagementModal from './components/UserManagementModal';
import { getCachedTrackUrls, cacheTrack, cacheAllTracks, syncUserCache, removeTrackFromCache } from './utils/cacheHelper';
import defaultTracks from './data/defaultTracks.js';
import { BACKEND_URL } from './utils/apiConfig';

export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  
  // Danh sách bài hát đồng bộ từ SoundCloud (hỗ trợ đọc ngay từ offline cache hoặc dữ liệu mặc định)
  const [soundcloudTracks, setSoundcloudTracks] = useState(() => {
    try {
      const saved = localStorage.getItem('nhacoffline_cached_soundcloud_tracks');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return Array.isArray(defaultTracks) ? defaultTracks : [];
  });

  // Playlist cá nhân của người dùng
  const [tracks, setTracks] = useState([]);
  // Phân loại playlist đang phát: 'soundcloud' hoặc 'my'
  const [activePlaylistType, setActivePlaylistType] = useState('soundcloud');
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [cachedUrls, setCachedUrls] = useState(new Set());
  const [downloadingUrls, setDownloadingUrls] = useState(new Set());
  const [playRequested, setPlayRequested] = useState(false);

  const isAdmin = user?.email === 'admin@nhacoffline.com' || user?.user_metadata?.role === 'admin';

  // Lấy playlist theo từng user ID
  const getStorageKey = (currentUser) => {
    if (!currentUser) return 'nhacoffline_playlist_guest';
    return `nhacoffline_playlist_${currentUser.id || currentUser.email}`;
  };

  // 1. Tải toàn bộ bài hát đã đồng bộ (chỉ khi ĐÃ ĐĂNG NHẬP, tự động fallback offline)
  const fetchSoundCloudTracks = async () => {
    if (!user) {
      setSoundcloudTracks([]);
      return [];
    }
    try {
      const res = await fetch(`${BACKEND_URL}/api/music/synced-tracks`);
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setSoundcloudTracks((prev) => {
            // Hợp nhất dữ liệu mới từ backend với các bài đang có trong session
            const map = new Map();
            data.forEach((t) => {
              if (t?.supabaseUrl) map.set(t.supabaseUrl, t);
            });
            (prev || []).forEach((t) => {
              if (t?.supabaseUrl && !map.has(t.supabaseUrl)) {
                map.set(t.supabaseUrl, t);
              }
            });
            const merged = Array.from(map.values());
            if (prev.length === merged.length && prev.every((t, i) => t.supabaseUrl === merged[i]?.supabaseUrl)) {
              return prev;
            }
            try {
              localStorage.setItem('nhacoffline_cached_soundcloud_tracks', JSON.stringify(merged));
            } catch (e) {
              console.warn('Lỗi lưu cache danh sách bài hát:', e);
            }
            return merged;
          });
          return data;
        }
      }
    } catch (err) {
      console.warn('Lỗi khi tải kho nhạc SoundCloud (có thể đang Offline):', err);
    }

    try {
      const saved = localStorage.getItem('nhacoffline_cached_soundcloud_tracks');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSoundcloudTracks(parsed);
          return parsed;
        }
      }
    } catch (e) {}

    // Fallback bundled tracks nếu chưa tải được từ mạng
    if (Array.isArray(defaultTracks) && defaultTracks.length > 0) {
      setSoundcloudTracks(defaultTracks);
      return defaultTracks;
    }

    return [];
  };

  // 2. Khởi tạo phiên đăng nhập từ localStorage
  useEffect(() => {
    try {
      const savedSession = localStorage.getItem('nhacoffline_auth_session');
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        if (parsed.user) {
          setUser(parsed.user);
        } else if (parsed.email) {
          setUser(parsed);
        }
      }
    } catch (e) {
      console.warn('Lỗi đọc session auth:', e);
    }
  }, []);

  // 3. Tải danh sách bài hát SoundCloud và định kỳ cập nhật realtime khi có bài mới (CHỈ KHI ĐÃ ĐĂNG NHẬP)
  useEffect(() => {
    if (!user) {
      setSoundcloudTracks([]);
      setTracks([]);
      return;
    }

    fetchSoundCloudTracks();

    // Polling nhẹ mỗi 4 giây để cập nhật bài mới ngay khi Extension cào từ SoundCloud về
    const interval = setInterval(fetchSoundCloudTracks, 4000);

    // Cập nhật tức thì khi người dùng quay lại tab Nhạc Offline
    const handleFocus = () => fetchSoundCloudTracks();
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user]);

  // 4. Đồng bộ Playlist cá nhân theo từng User (chỉ khi ĐÃ ĐĂNG NHẬP)
  useEffect(() => {
    if (!user) {
      setTracks([]);
      return;
    }
    const storageKey = getStorageKey(user);
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setTracks(Array.isArray(parsed) ? parsed : []);
      } catch {
        setTracks([]);
      }
    } else {
      setTracks([]);
    }
  }, [user]);

  // Lưu playlist cá nhân vào localStorage mỗi khi thay đổi (chỉ khi ĐÃ ĐĂNG NHẬP)
  useEffect(() => {
    if (!user) return;
    const storageKey = getStorageKey(user);
    try {
      localStorage.setItem(storageKey, JSON.stringify(tracks));
    } catch (e) {
      console.error('Không thể lưu playlist vào localStorage:', e);
    }
  }, [tracks, user]);

  // ⚡ TỰ ĐỘNG NẠP NGẦM PLAYLIST VÀO BỘ NHỚ OFFLINE TUẦN TỰ
  useEffect(() => {
    if (!user || tracks.length === 0 || !isOnline) return;

    let isCancelled = false;
    const timer = setTimeout(async () => {
      for (const track of tracks) {
        if (isCancelled) break;
        if (track?.supabaseUrl) {
          try {
            await cacheTrack(track.supabaseUrl);
          } catch (e) {
            // bỏ qua nếu lỗi
          }
        }
      }
      refreshCacheList();
    }, 1000);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [tracks, user?.id, isOnline]);

  // Lắng nghe sự kiện Online / Offline của trình duyệt
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Quét danh sách Cache API để biết bài nào đã sẵn sàng nghe Offline
  const refreshCacheList = async () => {
    const urls = await getCachedTrackUrls();
    setCachedUrls(new Set(urls.map(u => u.split('?')[0])));
  };

  useEffect(() => {
    refreshCacheList();
  }, [tracks, soundcloudTracks]);

  // Xử lý khi Backend đồng bộ xong bài hát từ SoundCloud
  const handleTrackSynced = (newTrack) => {
    setSoundcloudTracks((prev) => {
      const exists = prev.some((t) => t.supabaseUrl === newTrack.supabaseUrl);
      if (exists) return prev;
      return [newTrack, ...prev];
    });
    setTracks((prev) => {
      const exists = prev.some((t) => t.supabaseUrl === newTrack.supabaseUrl);
      if (exists) return prev;
      return [newTrack, ...prev];
    });
    setActivePlaylistType('soundcloud');
    setCurrentTrackIndex(0);
    setPlayRequested(true);

    if (newTrack?.supabaseUrl) {
      cacheTrack(newTrack.supabaseUrl).then((ok) => {
        if (ok) refreshCacheList();
      });
    }
  };

  // Thêm một bài hát vào Playlist cá nhân của user (Đồng thời tự động nạp ngầm vào Cache để nghe Offline)
  const handleAddToMyPlaylist = async (track) => {
    setTracks((prev) => {
      const exists = prev.some((t) => t.supabaseUrl === track.supabaseUrl);
      if (exists) return prev;
      return [...prev, track];
    });

    // ⚡ Tự động nạp ngầm file âm thanh vào Cache API để khi tắt mạng/ngắt Wi-Fi vẫn phát mượt mà
    if (track?.supabaseUrl) {
      const cleanUrl = track.supabaseUrl.split('?')[0];
      setDownloadingUrls((prev) => new Set([...prev, cleanUrl]));
      try {
        const ok = await cacheTrack(track.supabaseUrl);
        if (ok) {
          console.log('[App] Đã tự động lưu ngầm bài hát vào bộ nhớ Offline:', track.title);
          await refreshCacheList();
        }
      } catch (err) {
        console.warn('Lỗi lưu bài hát vào cache:', err);
      } finally {
        setDownloadingUrls((prev) => {
          const next = new Set(prev);
          next.delete(cleanUrl);
          return next;
        });
      }
    }
  };

  // Lưu một bài vào Cache Offline
  const handleCacheTrack = async (track) => {
    if (!track?.supabaseUrl) return;
    const ok = await cacheTrack(track.supabaseUrl);
    if (ok) {
      refreshCacheList();
    }
  };

  // Tải toàn bộ danh sách bài hát hiện tại vào Cache Offline
  const handleDownloadAll = async (listToCache) => {
    const list = listToCache || soundcloudTracks;
    await cacheAllTracks(list, () => {
      refreshCacheList();
    });
    refreshCacheList();
  };

  // Chọn bài hát để phát (từ danh sách SoundCloud hoặc Playlist cá nhân)
  const handleSelectTrack = (index, playImmediately = false, source = 'soundcloud') => {
    setActivePlaylistType(source);
    setCurrentTrackIndex(index);
    if (playImmediately) {
      setPlayRequested(true);
    }
    // LƯU Ý QUAN TRỌNG:
    // Khi người dùng bấm nghe ở tab SoundCloud, chỉ phát Stream trực tuyến từ Supabase,
    // TUYỆT ĐỐI KHÔNG tự động lưu vào Cache máy.
    // Chỉ lưu vào Cache Offline khi người dùng bấm nút [+ Thêm] vào "Playlist của tôi".
  };

  // Danh sách bài hát đang phát thực tế (chỉ khả dụng khi đã đăng nhập)
  const activeTrackList = user ? (activePlaylistType === 'my' ? tracks : soundcloudTracks) : [];
  const currentTrack = user ? (activeTrackList[currentTrackIndex] || null) : null;

  // Chuyển bài kế tiếp
  const handleNext = () => {
    if (activeTrackList.length === 0) return;
    setCurrentTrackIndex((prev) => (prev + 1) % activeTrackList.length);
  };

  // Lùi về bài trước
  const handlePrev = () => {
    if (activeTrackList.length === 0) return;
    setCurrentTrackIndex((prev) => (prev - 1 + activeTrackList.length) % activeTrackList.length);
  };

  // Xóa một bài khỏi Playlist & Kho nhạc (nếu là Admin)
  const handleRemoveTrack = async (track, fromSoundCloudList = false) => {
    if (fromSoundCloudList && isAdmin) {
      try {
        await fetch(`${BACKEND_URL}/api/music/admin/track?url=${encodeURIComponent(track.supabaseUrl)}`, {
          method: 'DELETE',
        });
      } catch (err) {
        console.warn('Lỗi khi gọi API xóa bài hát admin:', err);
      }
      setSoundcloudTracks((prev) => prev.filter((t) => t.supabaseUrl !== track.supabaseUrl));
    }

    // Xóa khỏi playlist cá nhân nếu đang xóa ở playlist cá nhân
    if (!fromSoundCloudList) {
      setTracks((prev) => {
        const updated = prev.filter(t => t.supabaseUrl !== track.supabaseUrl);
        const storageKey = getStorageKey(user);
        localStorage.setItem(storageKey, JSON.stringify(updated));
        return updated;
      });
    }

    // Xóa file âm thanh khỏi Cache API trình duyệt để giải phóng bộ nhớ
    if (track.supabaseUrl && 'caches' in window) {
      try {
        const cleanUrl = track.supabaseUrl.split('?')[0];
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          if (name.includes('music-cache')) {
            const cache = await caches.open(name);
            await cache.delete(cleanUrl);
          }
        }
        refreshCacheList();
      } catch (e) {
        console.warn('Lỗi dọn dẹp cache bài hát:', e);
      }
    }
  };

  // Đăng xuất: xóa session
  const handleLogout = () => {
    localStorage.removeItem('nhacoffline_auth_session');
    localStorage.removeItem('nhacoffline_playlist_guest');
    setUser(null);
    setTracks([]);
    setCurrentTrackIndex(0);
    setPlayRequested(false);
  };

  return (
    <div className="app-container">
      {/* Thanh Header ứng dụng */}
      <header className="app-header">
        <div className="header-brand-row">
          <div className="brand">
            <div className="brand-icon">
              <svg viewBox="0 0 24 24">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
              </svg>
            </div>
            <div className="brand-text">
              <span className="brand-title">Offline Sound</span>
            </div>
          </div>

          {/* Trạng thái kết nối mạng Online/Offline */}
          <div className={`network-badge ${isOnline ? 'online' : 'offline'}`}>
            <span className="status-dot"></span>
            <span>{isOnline ? 'Online' : 'Offline'}</span>
          </div>

          {!user && (
            <button 
              type="button" 
              className="btn-open-auth mobile-only-auth"
              onClick={() => setIsAuthOpen(true)}
            >
              <span>Đăng nhập</span>
            </button>
          )}
        </div>

        {/* Khu vực thông tin User & Đăng nhập */}
        <div className="header-user-row">
          {user ? (
            <div className="user-profile-badge">
              <div className="user-chip">
                {isAdmin ? (
                  <span className="user-role-badge admin">👑 Quản trị</span>
                ) : (
                  <span className="user-role-badge user">🎵 Thành viên</span>
                )}
                <span className="user-email" title={user.email}>{user.email}</span>
              </div>

              <div className="user-actions-cluster">
                {isAdmin && (
                  <button
                    type="button"
                    className="btn-admin-manage"
                    onClick={() => setIsUserModalOpen(true)}
                    title="Bảng điều khiển & Quản lý danh sách người dùng"
                  >
                    <span className="btn-admin-icon-wrapper">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                      </svg>
                    </span>
                    <span className="btn-admin-label">Quản lý</span>
                  </button>
                )}

                <button
                  type="button"
                  className="btn-logout"
                  onClick={handleLogout}
                  title="Đăng xuất khỏi tài khoản"
                >
                  Đăng xuất
                </button>
              </div>
            </div>
          ) : (
            <button 
              type="button" 
              className="btn-open-auth desktop-only-auth"
              onClick={() => setIsAuthOpen(true)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
              <span>Đăng nhập / Đăng ký</span>
            </button>
          )}
        </div>
      </header>

      {/* Vùng nội dung chính */}
      <main className="main-content">
        {/* Form dán link SoundCloud và nút đồng bộ */}
        <SoundCloudForm 
          onTrackSynced={handleTrackSynced} 
          isOnline={isOnline}
          user={user}
          onRequireAuth={() => setIsAuthOpen(true)}
        />

        {/* Danh sách bài hát (Playlist) */}
        <Playlist
          tracks={tracks}
          soundcloudTracks={soundcloudTracks}
          currentTrackIndex={currentTrackIndex}
          activePlaylistType={activePlaylistType}
          onSelectTrack={handleSelectTrack}
          cachedUrls={cachedUrls}
          downloadingUrls={downloadingUrls}
          onAddToMyPlaylist={handleAddToMyPlaylist}
          onRemoveTrack={handleRemoveTrack}
          isAdmin={isAdmin}
          user={user}
          isOnline={isOnline}
          onRequireAuth={() => setIsAuthOpen(true)}
        />
      </main>

      {/* Trình phát nhạc cố định ở đáy màn hình */}
      <AudioPlayer
        currentTrack={currentTrack}
        onNext={handleNext}
        onPrev={handlePrev}
        hasNext={activeTrackList.length > 1}
        hasPrev={activeTrackList.length > 1}
        user={user}
        playRequested={playRequested}
        onPlayStarted={() => setPlayRequested(false)}
      />

      {/* Modal Đăng nhập / Đăng ký */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={(authedUser) => setUser(authedUser)}
      />

      {/* Modal Quản lý Người dùng dành cho Admin */}
      <UserManagementModal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
      />
    </div>
  );
}
