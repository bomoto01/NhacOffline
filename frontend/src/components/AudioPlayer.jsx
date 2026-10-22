import React, { useState, useRef, useEffect } from 'react';

/**
 * Component AudioPlayer tùy biến từ thẻ <audio> HTML5
 * Quản lý phát nhạc, thanh tiến trình, điều khiển Play/Pause/Next/Prev,
 * và tự động chuyển bài khi kết thúc.
 */
export default function AudioPlayer({
  currentTrack,
  onNext,
  onPrev,
  hasNext,
  hasPrev,
  onTrackPlayed,
  user,
  playRequested,
  onPlayStarted
}) {
  const audioRef = useRef(null);
  const progressBarRef = useRef(null);
  // Cờ theo dõi người dùng đã chủ động bấm nghe nhạc hay chưa
  const userInteractedRef = useRef(false);
  // Lưu URL bài hát đang nạp vào thẻ audio để tránh bị reset currentTime khi component re-render
  const activeTrackUrlRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);

  // 1. Khi tài khoản thay đổi (Đăng nhập / Đăng xuất): Reset hoàn toàn, KHÔNG tự phát nhạc
  useEffect(() => {
    userInteractedRef.current = false;
    activeTrackUrlRef.current = null;
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, [user?.id, user?.email]);

  // 2. Lắng nghe khi người dùng bật nghe thử ở mục tìm kiếm thì dừng phát ở đây
  useEffect(() => {
    const handlePauseMain = () => {
      if (audioRef.current && isPlaying) {
        userInteractedRef.current = false;
        audioRef.current.pause();
        setIsPlaying(false);
      }
    };
    window.addEventListener('pause-main-player', handlePauseMain);
    return () => window.removeEventListener('pause-main-player', handlePauseMain);
  }, [isPlaying]);

  // 3. Xử lý nạp và phát nhạc khi bài hát thay đổi hoặc khi người dùng click chọn bài
  useEffect(() => {
    if (!audioRef.current || !currentTrack?.supabaseUrl) {
      return;
    }

    const audio = audioRef.current;
    const isNewTrack = activeTrackUrlRef.current !== currentTrack.supabaseUrl;

    if (isNewTrack) {
      activeTrackUrlRef.current = currentTrack.supabaseUrl;
      audio.src = currentTrack.supabaseUrl;
      audio.currentTime = 0;
      setCurrentTime(0);
      setDuration(currentTrack.durationSeconds || 0);
    }

    // Nếu người dùng click chọn bài (playRequested = true)
    if (playRequested) {
      userInteractedRef.current = true;
      audio.play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.warn('Lỗi khi phát bài hát:', err);
        });

      if (onPlayStarted) {
        onPlayStarted();
      }
    } else if (isNewTrack && userInteractedRef.current) {
      // Nếu đổi bài trong khi đang nghe nhạc tự động (Next/Prev)
      audio.play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.warn('Lỗi khi phát tiếp bài mới:', err);
        });
    }
  }, [currentTrack?.supabaseUrl, playRequested]);

  // Xử lý khi bài hát kết thúc (Hết bài -> TỰ ĐỘNG PHÁT BÀI TIẾP THEO)
  const handleEnded = () => {
    const audio = audioRef.current;
    // BẢO VỆ TUYỆT ĐỐI: Kiểm tra thời gian hiện tại so với thời lượng bài hát
    // Nếu bài hát có độ dài > 10s và currentTime chưa phát đến gần cuối (ví dụ mới nghe được 2s)
    // thì đây là sự cố ngắt kết nối mạng / stream ngắt giữa chừng, TUYỆT ĐỐI KHÔNG coi là bài hát đã kết thúc!
    if (audio && audio.duration && !isNaN(audio.duration) && audio.duration > 10) {
      if (audio.currentTime < audio.duration - 3) {
        console.warn(`[AudioPlayer] Phát hiện onEnded bất thường tại ${audio.currentTime.toFixed(1)}s / ${audio.duration.toFixed(1)}s. Đang khôi phục phát tiếp...`);
        audio.play().catch(e => console.warn('Không thể resume sau sự cố buffer:', e));
        return;
      }
    }

    userInteractedRef.current = true;
    if (hasNext && onNext) {
      onNext();
    } else if (audioRef.current) {
      // Nếu chỉ có 1 bài trong danh sách: tua về đầu và tiếp tục phát lặp lại
      audioRef.current.currentTime = 0;
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(err => console.warn('Lỗi phát lại bài:', err));
    }
  };

  // Nút chuyển bài tiếp theo
  const handleNextClick = () => {
    userInteractedRef.current = true;
    if (onNext) onNext();
  };

  // Nút lùi bài trước đó
  const handlePrevClick = () => {
    userInteractedRef.current = true;
    if (onPrev) onPrev();
  };

  // Cập nhật tiến trình thời gian
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setDuration(audioRef.current.duration || currentTrack?.durationSeconds || 0);
    }
  };

  // Toggle Play / Pause
  const togglePlayPause = () => {
    if (!audioRef.current || !currentTrack) return;
    if (isPlaying) {
      userInteractedRef.current = false;
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      userInteractedRef.current = true;
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(err => console.error('Lỗi khi phát nhạc:', err));
    }
  };

  // Tua bài hát theo tọa độ click hoặc cảm ứng vuốt trên điện thoại
  const seekToX = (clientX) => {
    if (!progressBarRef.current || !audioRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const seekTime = (clickX / rect.width) * duration;
    audioRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  const handleSeek = (e) => {
    seekToX(e.clientX);
  };

  const handleTouchSeek = (e) => {
    if (e.touches && e.touches.length > 0) {
      seekToX(e.touches[0].clientX);
    }
  };

  // Tua tới / lùi số giây nhất định (ví dụ: -10s, +10s)
  const handleSkip = (seconds) => {
    if (!audioRef.current || !duration) return;
    const newTime = Math.max(0, Math.min(audioRef.current.currentTime + seconds, duration));
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Thay đổi âm lượng
  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
      setIsMuted(val === 0);
    }
  };

  // Bật/tắt Mute
  const toggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.muted = false;
      setIsMuted(false);
    } else {
      audioRef.current.muted = true;
      setIsMuted(true);
    }
  };

  // Khi bài hát bắt đầu phát
  const handlePlayEvent = () => {
    setIsPlaying(true);
  };

  const handlePauseEvent = () => {
    setIsPlaying(false);
  };

  // Khi metadata của bài hát (thời lượng, âm thanh) được nạp thành công
  const handleLoadedMetadata = () => {
    if (audioRef.current && audioRef.current.duration && !isNaN(audioRef.current.duration) && audioRef.current.duration !== Infinity) {
      setDuration(audioRef.current.duration);
    }
  };

  // Định dạng thời gian mm:ss
  const formatTime = (secs) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <footer className="audio-player-dock">
      {/* Thẻ audio ẩn nhận luồng phát từ Supabase Storage và Cache API */}
      <audio
        ref={audioRef}
        preload="auto"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onPlay={handlePlayEvent}
        onPause={handlePauseEvent}
        onError={(e) => {
          const mediaErr = audioRef.current?.error;
          console.error('Audio element gặp lỗi khi tải:', mediaErr ? { code: mediaErr.code, message: mediaErr.message } : e);
        }}
      />

      {/* Thông tin bài hát đang phát */}
      <div className="player-track-info">
        {currentTrack ? (
          <>
            <img
              src={currentTrack.coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&q=80'}
              alt={currentTrack.title}
              className="player-cover"
              onError={(e) => {
                e.target.src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&q=80';
              }}
            />
            <div className="player-text">
              <div className="player-title">{currentTrack.title}</div>
              <div className="player-artist">
                <span>{currentTrack.artist || 'SoundCloud'}</span>
                <span className="player-mobile-time"> • {formatTime(currentTime)} / {formatTime(duration)}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="player-text">
            <div className="player-title" style={{ color: 'var(--text-sub)' }}>Chưa chọn bài hát</div>
          </div>
        )}
      </div>

      {/* Điều khiển trung tâm (Previous, Skip -10s, Play/Pause, Skip +10s, Next, Thanh tiến trình) */}
      <div className="player-center-controls">
        <div className="control-buttons">
          {/* Nút lùi bài */}
          <button
            className="btn-icon"
            onClick={handlePrevClick}
            disabled={!hasPrev}
            title="Bài trước đó"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
            </svg>
          </button>

          {/* Nút tua lùi 10s */}
          <button
            className="btn-icon btn-seek-step"
            onClick={() => handleSkip(-10)}
            disabled={!currentTrack}
            title="Tua lùi 10 giây"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.5 8c-2.65 0-5.05 1-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.2 3.16-1.98 5.12-1.98 3.76 0 6.9 2.61 7.7 6.13l2.42-.8C21.43 11.23 17.37 8 12.5 8z"/>
            </svg>
            <span className="seek-step-num">10</span>
          </button>

          {/* Nút Play / Pause */}
          <button
            className="btn-play-pause"
            onClick={togglePlayPause}
            disabled={!currentTrack}
            title={isPlaying ? 'Tạm dừng' : 'Phát'}
          >
            {isPlaying ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            )}
          </button>

          {/* Nút tua tiến 10s */}
          <button
            className="btn-icon btn-seek-step"
            onClick={() => handleSkip(10)}
            disabled={!currentTrack}
            title="Tua tới 10 giây"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.5 8c2.65 0 5.05 1 6.9 2.6L22 7v9h-9l3.62-3.62c-1.39-1.2-3.16-1.98-5.12-1.98-3.76 0-6.9 2.61-7.7 6.13l-2.42-.8C2.57 11.23 6.63 8 11.5 8z"/>
            </svg>
            <span className="seek-step-num">10</span>
          </button>

          {/* Nút chuyển bài tiếp theo */}
          <button
            className="btn-icon"
            onClick={handleNextClick}
            disabled={!hasNext}
            title="Bài tiếp theo"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
            </svg>
          </button>
        </div>

        {/* Thanh tua bài hát (Seekbar cảm ứng mượt mà cả Desktop và Mobile) */}
        <div className="playback-bar">
          <span className="time-display">{formatTime(currentTime)}</span>
          <div
            className="progress-bar-container"
            ref={progressBarRef}
            onClick={handleSeek}
            onTouchStart={handleTouchSeek}
            onTouchMove={handleTouchSeek}
          >
            <div
              className="progress-bar-fill"
              style={{ width: `${progressPercent}%` }}
            >
              <div className="progress-bar-thumb" />
            </div>
          </div>
          <span className="time-display">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Điều khiển âm lượng bên phải */}
      <div className="player-right-controls">
        <button className="btn-icon" onClick={toggleMute} title={isMuted ? 'Bật âm' : 'Tắt tiếng'}>
          {isMuted || volume === 0 ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
          )}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          className="volume-slider"
          title="Âm lượng"
        />
      </div>
    </footer>
  );
}
