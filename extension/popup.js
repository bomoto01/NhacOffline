/**
 * Popup Script cho Nhạc Offline Extension
 */

document.addEventListener('DOMContentLoaded', async () => {
  const toggleAutoSync = document.getElementById('toggleAutoSync');
  const backendUrlInput = document.getElementById('backendUrlInput');
  const btnSaveUrl = document.getElementById('btnSaveUrl');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const recentList = document.getElementById('recentList');
  const btnClearHistory = document.getElementById('btnClearHistory');
  const btnOpenWebApp = document.getElementById('btnOpenWebApp');

  // 1. Tải cài đặt từ chrome.storage.local
  const { backendUrl = 'https://nhacoffline.onrender.com', autoSync = true, recentTracks = [] } =
    await chrome.storage.local.get(['backendUrl', 'autoSync', 'recentTracks']);

  backendUrlInput.value = backendUrl;
  toggleAutoSync.checked = autoSync;

  // 2. Kiểm tra kết nối đến Máy chủ Backend
  async function checkServerConnection(url) {
    statusDot.className = 'status-badge';
    statusText.textContent = 'Đang kiểm tra...';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${url}/api/music/trending`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        statusDot.className = 'status-badge online';
        statusText.textContent = 'Kết nối';
      } else {
        statusDot.className = 'status-badge offline';
        statusText.textContent = 'Lỗi máy chủ';
      }
    } catch (e) {
      statusDot.className = 'status-badge offline';
      statusText.textContent = 'Mất kết nối';
    }
  }

  checkServerConnection(backendUrl);

  // 3. Render danh sách bài hát vừa đồng bộ
  function renderRecentTracks(tracks) {
    if (!tracks || tracks.length === 0) {
      recentList.innerHTML = '<div class="empty-hint">Chưa có bài hát nào được đồng bộ. Hãy mở SoundCloud và nghe thử một bài nhé!</div>';
      return;
    }

    recentList.innerHTML = tracks.map(t => `
      <div class="recent-item">
        <div class="recent-item-info">
          <div class="recent-item-title" title="${t.title}">${t.title}</div>
          <div class="recent-item-artist">${t.artist || 'SoundCloud'}</div>
        </div>
        <div class="recent-item-time">${t.time || ''}</div>
      </div>
    `).join('');
  }

  renderRecentTracks(recentTracks);

  // 4. Lưu bật/tắt Tự động đồng bộ
  toggleAutoSync.addEventListener('change', async () => {
    await chrome.storage.local.set({ autoSync: toggleAutoSync.checked });
  });

  // 5. Lưu URL Backend mới
  btnSaveUrl.addEventListener('click', async () => {
    let cleanUrl = backendUrlInput.value.trim().replace(/\/+$/, '');
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'http://' + cleanUrl;
    }
    backendUrlInput.value = cleanUrl;
    await chrome.storage.local.set({ backendUrl: cleanUrl });
    checkServerConnection(cleanUrl);
  });

  // 6. Xóa lịch sử vừa đồng bộ
  btnClearHistory.addEventListener('click', async () => {
    await chrome.storage.local.set({ recentTracks: [] });
    renderRecentTracks([]);
  });

  // 7. Mở Web App Nhạc Offline
  btnOpenWebApp.addEventListener('click', () => {
    chrome.tabs.create({ url: 'http://localhost:5173' });
  });
});
