/**
 * Nhạc Offline - SoundCloud Auto Sync Content Script
 * - Tự động phát hiện bài hát đang phát trên SoundCloud và đồng bộ về ứng dụng Nhạc Offline
 * - QUAN TRỌNG: Kiểm tra lịch sử để KHÔNG BAO GIỜ đồng bộ lại những bài đã từng nghe/đồng bộ
 */

(function () {
  // Tập hợp chứa tất cả URL bài hát đã đồng bộ (bao gồm cả dữ liệu từ máy chủ)
  const syncedUrlsSet = new Set();
  // Tập hợp chứa các URL bài hát đang trong tiến trình đồng bộ (in-flight) để chống trigger lặp
  const inFlightSyncUrls = new Set();
  let currentActiveTrackUrl = null;
  let currentNotifiedUrl = null;
  let debounceTimer = null;
  let countdownInterval = null;
  let activeCountdownToast = null;
  let toastContainer = null;

  console.log('[Nhạc Offline Extension] Content script đã kích hoạt trên SoundCloud!');

  // Tạo container cho thông báo Toast trên SoundCloud
  function getToastContainer() {
    if (!toastContainer || !document.body.contains(toastContainer)) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'nhacoffline-toast-container';
      document.body.appendChild(toastContainer);
    }
    return toastContainer;
  }

  // Hiển thị thông báo Toast đẹp mắt (tự động xóa thông báo syncing cũ để chống xếp chồng)
  function showToast(type, title, message, duration = 3500) {
    const container = getToastContainer();

    // Nếu là thông báo đang đồng bộ, xóa ngay mọi toast syncing cũ để không bao giờ bị xếp lớp nhiều khung cam
    if (type === 'syncing') {
      const oldSyncing = container.querySelectorAll('.nhacoffline-toast.syncing');
      oldSyncing.forEach(el => el.remove());
    }

    // Giới hạn tối đa 3 thông báo cùng lúc trên màn hình
    const currentToasts = container.querySelectorAll('.nhacoffline-toast');
    if (currentToasts.length >= 3) {
      currentToasts[0].remove();
    }

    const toast = document.createElement('div');
    toast.className = `nhacoffline-toast ${type}`;

    let iconHtml = '🎵';
    if (type === 'syncing') {
      iconHtml = '<div class="nhacoffline-spinner"></div>';
    } else if (type === 'success') {
      iconHtml = '✅';
    } else if (type === 'info') {
      iconHtml = '🎧';
    } else if (type === 'error') {
      iconHtml = '⚠️';
    }

    toast.innerHTML = `
      <div class="nhacoffline-toast-icon">${iconHtml}</div>
      <div class="nhacoffline-toast-body">
        <div class="nhacoffline-toast-title">${title}</div>
        <div class="nhacoffline-toast-msg" title="${message}">${message}</div>
      </div>
    `;

    container.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => {
        toast.style.animation = 'nhacofflineFadeOut 0.3s forwards';
        setTimeout(() => toast.remove(), 350);
      }, duration);
    }

    return toast;
  }

  // Chuẩn hóa link bài hát SoundCloud
  function cleanSoundCloudUrl(url) {
    if (!url) return '';
    try {
      const u = new URL(url, window.location.origin);
      return `${u.origin}${u.pathname}`.toLowerCase().replace(/\/+$/, '');
    } catch {
      return url.split('?')[0].toLowerCase().replace(/\/+$/, '');
    }
  }

  // 1. Tải danh sách bài hát đã đồng bộ từ Bộ nhớ Local & Máy chủ Backend
  async function initSyncedHistory() {
    try {
      // 1.1 Đọc từ chrome.storage.local
      const { syncedUrlsHistory = [], backendUrl = 'http://localhost:8080' } =
        await chrome.storage.local.get(['syncedUrlsHistory', 'backendUrl']);
      
      syncedUrlsHistory.forEach(u => syncedUrlsSet.add(cleanSoundCloudUrl(u)));

      // 1.2 Truy vấn Backend lấy toàn bộ danh sách đã có trên Supabase
      const res = await fetch(`${backendUrl}/api/music/synced-urls`, { method: 'GET' }).catch(() => null);
      if (res && res.ok) {
        const serverUrls = await res.json();
        if (Array.isArray(serverUrls)) {
          serverUrls.forEach(u => {
            if (u) {
              syncedUrlsSet.add(cleanSoundCloudUrl(u));
              syncedUrlsSet.add(u.toLowerCase());
            }
          });
        }
      }
      console.log(`[Nhạc Offline Extension] Đã tải danh sách ${syncedUrlsSet.size} bài đã đồng bộ trước đó.`);
    } catch (e) {
      console.warn('[Nhạc Offline Extension] Không thể tải danh sách synced-urls:', e);
    }
  }

  initSyncedHistory();

  // Kiểm tra thông tin bài hát đang phát ở thanh điều khiển của SoundCloud
  function getCurrentlyPlayingTrack() {
    const playBtn = document.querySelector('.playControl') || 
                    document.querySelector('.playControls__play') ||
                    document.querySelector('button[title*="Pause"]') ||
                    document.querySelector('button[aria-label*="Pause"]');
    
    const isPlaying = playBtn && (
      playBtn.classList.contains('playing') || 
      playBtn.getAttribute('aria-label')?.toLowerCase().includes('pause') ||
      playBtn.getAttribute('title')?.toLowerCase().includes('pause')
    );

    if (!isPlaying) {
      return null;
    }

    const titleLink = document.querySelector('.playbackSoundBadge__titleLink') ||
                      document.querySelector('a.playbackSoundBadge__title') ||
                      document.querySelector('.playbackSoundBadge a[href*="/"]');

    if (!titleLink || !titleLink.getAttribute('href')) {
      return null;
    }

    const rawHref = titleLink.getAttribute('href');
    const trackUrl = cleanSoundCloudUrl(rawHref);

    if (!trackUrl || trackUrl.endsWith('/discover') || trackUrl.endsWith('/stream')) {
      return null;
    }

    const title = titleLink.getAttribute('title') || 
                  titleLink.querySelector('span')?.textContent?.trim() || 
                  titleLink.textContent?.trim() || 
                  'Bài hát SoundCloud';

    const artistLink = document.querySelector('.playbackSoundBadge__lightLink') ||
                       document.querySelector('.playbackSoundBadge__avatar a');
    const artist = artistLink?.textContent?.trim() || 'SoundCloud Artist';

    return {
      url: trackUrl,
      title: title,
      artist: artist
    };
  }

  // Gửi link về Backend để đồng bộ lên Supabase Storage và Playlist
  async function syncTrackToBackend(track) {
    const { backendUrl = 'http://localhost:8080', autoSync = true } = 
      await chrome.storage.local.get(['backendUrl', 'autoSync']);

    if (!autoSync) {
      console.log('[Nhạc Offline Extension] Tự động đồng bộ đang tắt trong cài đặt.');
      return;
    }

    const cleanKey = cleanSoundCloudUrl(track.url);

    // Chống đồng bộ trùng lặp tuyệt đối
    if (inFlightSyncUrls.has(cleanKey)) {
      console.log(`[Nhạc Offline Extension] Bài "${track.title}" đang được xử lý, bỏ qua trigger lặp.`);
      return;
    }

    // ĐÁNH DẤU KHÓA NGAY LẬP TỨC: Đưa vào inFlightSyncUrls và syncedUrlsSet
    inFlightSyncUrls.add(cleanKey);
    syncedUrlsSet.add(cleanKey);
    syncedUrlsSet.add(track.url.toLowerCase());

    console.log(`[Nhạc Offline Extension] Bắt đầu đồng bộ bài hát sang ${backendUrl}:`, track);
    const syncToast = showToast('syncing', 'Đang đồng bộ về Nhạc Offline...', `${track.title} - ${track.artist}`, 0);

    try {
      const response = await fetch(`${backendUrl}/api/music/sync-soundcloud`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ url: track.url })
      });

      syncToast.remove();

      if (response.ok) {
        const data = await response.json();
        console.log('[Nhạc Offline Extension] Đồng bộ thành công:', data);
        showToast('success', 'Đã đồng bộ vào Nhạc Offline!', data.title || track.title, 4000);

        if (data.id) syncedUrlsSet.add(data.id.toLowerCase());

        // Lưu vào chrome.storage.local
        const { syncedUrlsHistory = [], recentTracks = [] } = 
          await chrome.storage.local.get(['syncedUrlsHistory', 'recentTracks']);

        const updatedHistory = Array.from(new Set([cleanKey, ...syncedUrlsHistory]));
        const updatedRecent = [
          {
            title: data.title || track.title,
            artist: data.artist || track.artist,
            url: track.url,
            supabaseUrl: data.supabaseUrl,
            time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
          },
          ...recentTracks.filter(t => cleanSoundCloudUrl(t.url) !== cleanKey)
        ].slice(0, 20);

        await chrome.storage.local.set({
          syncedUrlsHistory: updatedHistory,
          recentTracks: updatedRecent
        });
      } else {
        const errData = await response.json().catch(() => ({}));
        console.warn('[Nhạc Offline Extension] Backend báo lỗi:', errData);
        showToast('error', 'Lỗi đồng bộ', errData.message || 'Không thể tải bài này.', 3500);
      }
    } catch (err) {
      syncToast.remove();
      console.error('[Nhạc Offline Extension] Lỗi mạng:', err);
      showToast('error', 'Không kết nối được Nhạc Offline', 'Hãy kiểm tra xem server máy chủ port 8080 đang chạy.', 4000);
    } finally {
      inFlightSyncUrls.delete(cleanKey);
    }
  }

  // Vòng lặp kiểm tra trạng thái phát nhạc (quét mỗi 1.5 giây)
  function checkPlaybackState() {
    const track = getCurrentlyPlayingTrack();
    if (!track) {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
      if (activeCountdownToast && document.body.contains(activeCountdownToast)) {
        activeCountdownToast.remove();
        activeCountdownToast = null;
      }
      currentActiveTrackUrl = null;
      return;
    }

    const cleanKey = cleanSoundCloudUrl(track.url);

    // 1. Kiểm tra nếu bài hát đã có sẵn trên hệ thống -> Bỏ qua hoàn toàn
    if (syncedUrlsSet.has(cleanKey) || syncedUrlsSet.has(track.url.toLowerCase())) {
      if (currentNotifiedUrl !== cleanKey) {
        currentNotifiedUrl = cleanKey;
        currentActiveTrackUrl = cleanKey;
        console.log(`[Nhạc Offline Extension] Bài "${track.title}" đã nghe & đồng bộ trước đó. Bỏ qua không đồng bộ lại.`);
        showToast('info', 'Bài hát đã có sẵn', `${track.title} • Sẵn sàng nghe trên Nhạc Offline`, 2500);
      }
      return;
    }

    // 2. Nếu bài hát đang trong tiến trình đồng bộ -> Bỏ qua không trigger lại
    if (inFlightSyncUrls.has(cleanKey)) {
      return;
    }

    // 3. Nếu người dùng vẫn đang tiếp tục nghe đúng bài này -> Giữ nguyên, không tạo thêm timer
    if (currentActiveTrackUrl === cleanKey) {
      return;
    }

    // 4. Phát hiện bài hát MỚI toanh:
    currentActiveTrackUrl = cleanKey;
    currentNotifiedUrl = cleanKey;
    console.log(`[Nhạc Offline Extension] Phát hiện bài hát MỚI: "${track.title}" (${track.url})`);

    // Dọn dẹp bộ hẹn giờ và thông báo cũ nếu còn
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    if (activeCountdownToast && document.body.contains(activeCountdownToast)) {
      activeCountdownToast.remove();
      activeCountdownToast = null;
    }

    // Hiển thị thông báo nhỏ đếm ngược 15s kèm nút Bỏ qua để tránh đồng bộ ồ ạt khi chỉ nghe lướt
    let secondsLeft = 15;
    activeCountdownToast = showToast('info', `Sẽ lưu sau ${secondsLeft}s (Bấm để Bỏ qua)`, track.title, 0);
    activeCountdownToast.style.cursor = 'pointer';
    activeCountdownToast.title = 'Click vào thông báo này nếu bạn chỉ nghe thử và KHÔNG muốn lưu bài này';

    const currentToastRef = activeCountdownToast;
    countdownInterval = setInterval(() => {
      secondsLeft--;
      if (secondsLeft > 0 && currentToastRef && document.body.contains(currentToastRef)) {
        const titleEl = currentToastRef.querySelector('.nhacoffline-toast-title');
        if (titleEl) titleEl.textContent = `Sẽ lưu sau ${secondsLeft}s (Bấm để Bỏ qua)`;
      } else {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    }, 1000);

    currentToastRef.onclick = () => {
      console.log(`[Nhạc Offline Extension] Người dùng đã chủ động BỎ QUA bài "${track.title}"`);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
      syncedUrlsSet.add(cleanKey); // Khóa không đồng bộ bài này trong phiên làm việc
      currentToastRef.remove();
      activeCountdownToast = null;
      showToast('info', 'Đã bỏ qua bài hát', `Không lưu: ${track.title}`, 2000);
    };

    // Đợi đúng 15 giây: Chỉ khi người dùng thực sự ngồi nghe thì mới tự động đồng bộ về
    debounceTimer = setTimeout(() => {
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
      if (currentToastRef && document.body.contains(currentToastRef)) {
        currentToastRef.remove();
        activeCountdownToast = null;
      }
      debounceTimer = null;
      // QUAN TRỌNG: Không gán currentActiveTrackUrl = null vì người dùng vẫn đang nghe bài này!
      syncTrackToBackend(track);
    }, 15000);
  }

  // Khởi chạy vòng quét định kỳ
  setInterval(checkPlaybackState, 1500);

  // Lắng nghe qua MutationObserver (kèm debounce 500ms) để phản hồi nhanh khi chuyển bài mà không bị quá tải
  let observerDebounce = null;
  const observer = new MutationObserver(() => {
    if (observerDebounce) clearTimeout(observerDebounce);
    observerDebounce = setTimeout(checkPlaybackState, 500);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'aria-label', 'title', 'href']
  });
})();
