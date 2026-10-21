import React, { useState, useRef } from 'react';

/**
 * Component Tìm kiếm, Nghe thử (Preview Stream) & Đồng bộ SoundCloud
 * Hỗ trợ:
 * 1. Dán link bài hát trực tiếp -> Đồng bộ ngay.
 * 2. Gõ tên bài hát -> Tìm kiếm danh sách các bản (gốc, remix, cover...)
 * 3. CÓ NÚT PLAY ▶ ĐỂ NGHE THỬ TRƯỚC: Bấm vào nghe thử xem đúng bản mình muốn không!
 * 4. Bấm "Lưu bản này" để upload thẳng lên Supabase và thêm vào Playlist.
 */
export default function SoundCloudForm({ onTrackSynced, isOnline, user, onRequireAuth }) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // State quản lý việc Nghe thử (Preview)
  const previewAudioRef = useRef(null);
  const [previewingUrl, setPreviewingUrl] = useState(null);
  const [previewingTitle, setPreviewingTitle] = useState('');
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const isLink = query.trim().startsWith('http://') || query.trim().startsWith('https://');

  // Format thời lượng giây thành mm:ss
  const formatTime = (secs) => {
    if (!secs || isNaN(secs)) return '--:--';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Tính toán dung lượng file tải về ước tính dựa trên thời lượng (128kbps ~ 16KB/s)
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

  // Dừng nghe thử nếu đang phát
  // Dừng nghe thử nếu đang phát
  const stopPreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.removeAttribute('src');
      previewAudioRef.current.load();
    }
    setPreviewingUrl(null);
    setPreviewingTitle('');
    setIsPlayingPreview(false);
    setLoadingPreview(false);
  };

  // Xử lý bật / tắt nghe thử (Preview)
  const handleTogglePreview = (targetUrl, itemTitle) => {
    if (!previewAudioRef.current || !targetUrl) return;

    // Nếu đang nghe đúng bài này -> Tạm dừng
    if (previewingUrl === targetUrl && isPlayingPreview) {
      previewAudioRef.current.pause();
      setIsPlayingPreview(false);
      return;
    }

    // Nếu đang dừng đúng bài này -> Tiếp tục phát
    if (previewingUrl === targetUrl && !isPlayingPreview) {
      previewAudioRef.current.play()
        .then(() => setIsPlayingPreview(true))
        .catch(err => console.error('Lỗi tiếp tục phát preview:', err));
      return;
    }

    // Tạm dừng trình phát nhạc chính ở dưới đáy màn hình để tránh 2 tiếng phát đè lên nhau
    window.dispatchEvent(new CustomEvent('pause-main-player'));

    // Cập nhật thông tin bài nghe thử
    setPreviewingUrl(targetUrl);
    setPreviewingTitle(itemTitle || 'Bài hát đang nghe thử');
    setLoadingPreview(true);
    setIsPlayingPreview(false);

    const audio = previewAudioRef.current;
    audio.pause();
    const streamUrl = `/api/music/stream-preview?url=${encodeURIComponent(targetUrl)}&_t=${Date.now()}`;
    audio.src = streamUrl;
    audio.volume = 1.0;
    audio.load();

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlayingPreview(true);
          setLoadingPreview(false);
        })
        .catch((err) => {
          console.warn('Trình duyệt đang đệm stream preview...', err);
        });
    }
  };

  // Xử lý khi nhấn nút Submit từ ô Input
  const handleSubmit = async (e) => {
    e.preventDefault();
    const inputVal = query.trim();
    if (!inputVal) return;

    if (!isOnline) {
      setError('Thiết bị đang Offline. Vui lòng kết nối mạng để tìm kiếm hoặc đồng bộ.');
      return;
    }

    stopPreview();
    setError(null);
    setSuccess(null);

    // TRƯỜNG HỢP 1: Người dùng dán link trực tiếp
    if (isLink) {
      if (!user) {
        setError('Vui lòng đăng nhập tài khoản để đồng bộ và tải bài hát từ SoundCloud.');
        if (onRequireAuth) onRequireAuth();
        return;
      }
      saveTrack(inputVal, 'Link trực tiếp');
      return;
    }

    // TRƯỜNG HỢP 2: Người dùng gõ tên bài hát -> Tìm kiếm danh sách các bản nhạc
    setSearching(true);
    setSearchResults([]);

    try {
      const response = await fetch(`/api/music/search?q=${encodeURIComponent(inputVal)}&limit=6`);
      if (!response.ok) {
        throw new Error('Lỗi khi tìm kiếm bài hát từ máy chủ.');
      }
      const data = await response.json();
      if (!data || data.length === 0) {
        setError(`Không tìm thấy bản nhạc nào phù hợp với từ khóa "${inputVal}". Hãy thử từ khóa khác.`);
      } else {
        setSearchResults(data);
      }
    } catch (err) {
      console.error('Lỗi tìm kiếm:', err);
      setError(err.message || 'Không thể tìm kiếm bài hát lúc này.');
    } finally {
      setSearching(false);
    }
  };

  // Lưu một bản nhạc cụ thể từ danh sách tìm kiếm lên Supabase
  const saveTrack = async (targetUrl, trackTitle) => {
    // Yêu cầu đăng nhập trước khi tải/đồng bộ nhạc
    if (!user) {
      setError('Vui lòng đăng nhập tài khoản để đồng bộ và lưu bài hát vào playlist của bạn.');
      if (onRequireAuth) onRequireAuth();
      return;
    }

    // Dừng nghe thử nếu đang nghe
    stopPreview();

    setSavingId(targetUrl);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/music/sync-soundcloud', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: targetUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Lỗi khi đồng bộ nhạc lên Supabase.');
      }

      setSuccess(`Đã lưu thành công bản nhạc: "${data.title}"`);
      if (onTrackSynced) {
        onTrackSynced(data);
      }
    } catch (err) {
      console.error('Lỗi lưu bản nhạc:', err);
      setError(err.message || 'Có lỗi xảy ra khi lưu bài hát.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="sync-section">

      <h2>Thêm bài hát mới</h2>
      <p>Dán link SoundCloud <b>hoặc nhập tên bài hát</b> để nghe thử và chọn bản nhạc ưng ý nhất.</p>

      <form onSubmit={handleSubmit} className="sync-form">
        <div className="input-wrapper">
          <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z"/>
          </svg>
          <input
            type="text"
            className="sync-input"
            placeholder="Dán link SoundCloud HOẶC nhập tên bài hát (VD: Gái tây gốc việt, Faded...)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={searching || savingId !== null}
          />
        </div>

        <button 
          type="submit" 
          className="sync-button" 
          disabled={searching || savingId !== null || !query.trim()}
        >
          {searching ? (
            <>
              <div className="spinner"></div>
              <span>Đang tìm kiếm...</span>
            </>
          ) : isLink ? (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
              </svg>
              <span>Đồng bộ ngay</span>
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
              </svg>
              <span>Tìm kiếm</span>
            </>
          )}
        </button>
      </form>

      {/* Lời nhắc đăng nhập dành cho khách */}
      {!user && (
        <div className="auth-hint-banner" onClick={onRequireAuth} title="Nhấn để đăng nhập hoặc tạo tài khoản">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6-5c1.66 0 3 1.34 3 3v2H9V6c0-1.66 1.34-3 3-3z"/>
          </svg>
          <span>Chế độ Khách: Bạn có thể tìm & nghe thử. Hãy <strong>Đăng nhập / Đăng ký</strong> để tải nhạc vào playlist!</span>
        </div>
      )}

      {/* Thông báo kết quả / lỗi */}
      {error && (
        <div className="alert-box alert-error">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="alert-box alert-success">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
          <span>{success}</span>
        </div>
      )}

      {/* DANH SÁCH BẢN NHẠC TÌM ĐƯỢC - CÓ NÚT PLAY NGHE THỬ */}
      {searchResults.length > 0 && (
        <div className="search-results-section">
          <div className="search-results-header">
            <h4>Tìm thấy {searchResults.length} bản nhạc. Bấm ▶ để nghe thử và chọn bản bạn thích:</h4>
            <button 
              className="btn-close-results"
              onClick={() => {
                stopPreview();
                setSearchResults([]);
              }}
              title="Đóng kết quả tìm kiếm"
            >
              ✕ Đóng
            </button>
          </div>

          {/* THANH MINI AUDIO PLAYER TRỰC QUAN KHI ĐANG NGHE THỬ */}
          <div 
            className="mini-preview-banner" 
            style={{ display: previewingUrl ? 'flex' : 'none' }}
          >
            <div className="mini-preview-meta">
              <span className="mini-preview-badge">▶ Đang nghe thử:</span>
              <span className="mini-preview-title">{previewingTitle}</span>
            </div>
            <div className="mini-preview-audio-container">
              <audio
                ref={previewAudioRef}
                controls
                controlsList="nodownload"
                className="mini-preview-audio-element"
                onWaiting={() => setLoadingPreview(true)}
                onPlaying={() => {
                  setLoadingPreview(false);
                  setIsPlayingPreview(true);
                }}
                onCanPlay={() => setLoadingPreview(false)}
                onEnded={() => {
                  setIsPlayingPreview(false);
                  setPreviewingUrl(null);
                  setLoadingPreview(false);
                }}
                onPause={() => setIsPlayingPreview(false)}
                onError={(e) => {
                  console.warn('Lỗi audio preview:', e);
                  setLoadingPreview(false);
                  setIsPlayingPreview(false);
                }}
              />
              <button
                type="button"
                className="btn-close-preview"
                onClick={stopPreview}
                title="Dừng nghe thử"
              >
                ✕ Dừng
              </button>
            </div>
          </div>

          <div className="search-results-list">
            {searchResults.map((item) => {
              const targetUrl = item.url || item.id;
              const isItemSaving = savingId === targetUrl;
              const isThisPreviewing = previewingUrl === targetUrl;
              const isThisPlaying = isThisPreviewing && isPlayingPreview;
              const isThisLoading = isThisPreviewing && loadingPreview;
              const estimatedSizeStr = formatSize(item.durationSeconds, item.formattedSize);

              return (
                <div key={item.id} className={`search-result-card ${isThisPlaying ? 'playing' : ''}`}>
                  {/* NÚT PLAY / PAUSE NGHE THỬ */}
                  <button
                    type="button"
                    className={`btn-preview-play ${isThisPlaying ? 'active' : ''}`}
                    onClick={() => handleTogglePreview(targetUrl, item.title)}
                    title={isThisPlaying ? 'Tạm dừng nghe thử' : 'Bấm để nghe thử bản này'}
                  >
                    {isThisLoading ? (
                      <div className="spinner-preview"></div>
                    ) : isThisPlaying ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    )}
                  </button>

                  {/* THÔNG TIN BẢN NHẠC */}
                  <div className="result-info">
                    <div className="result-title" title={item.title}>
                      {item.title}
                      {isThisPlaying && <span className="preview-indicator">Đang nghe thử...</span>}
                    </div>
                    <div className="result-meta">
                      <span className="result-artist">{item.artist}</span>
                      <span className="result-dot">•</span>
                      <span className="result-duration">{formatTime(item.durationSeconds)}</span>
                      {estimatedSizeStr && (
                        <>
                          <span className="result-dot">•</span>
                          <span className="result-size" title="Dung lượng tải về máy ước tính">
                            💾 {estimatedSizeStr}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* NÚT LƯU BẢN NÀY */}
                  <button
                    className="btn-save-track"
                    disabled={savingId !== null}
                    onClick={() => saveTrack(targetUrl, item.title)}
                  >
                    {isItemSaving ? (
                      <>
                        <div className="spinner-small"></div>
                        <span>Đang lưu...</span>
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
                        </svg>
                        <span>Lưu bản này</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
