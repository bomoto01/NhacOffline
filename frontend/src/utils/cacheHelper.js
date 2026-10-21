/**
 * Helper tương tác trực tiếp với Cache API của trình duyệt từ phía React.
 * Cho phép kiểm tra bài hát nào đã được lưu Offline, hoặc chủ động tải trước vào cache.
 */

export const MUSIC_CACHE_NAME = 'nhacoffline-music-cache-v1';

/**
 * Kiểm tra xem URL bài hát đã được lưu trong bất kỳ Cache API âm thanh nào chưa
 * @param {string} url Supabase Public URL
 * @returns {Promise<boolean>}
 */
export async function isTrackCached(url) {
    if (!('caches' in window) || !url) return false;
    try {
        const cleanUrl = url.split('?')[0];
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
            if (name.includes('music')) {
                const cache = await caches.open(name);
                const match = await cache.match(cleanUrl);
                if (match) return true;
            }
        }
        return false;
    } catch (e) {
        console.error('Lỗi khi kiểm tra cache bài hát:', e);
        return false;
    }
}

/**
 * Chủ động lưu bài hát vào Cache API để nghe Offline
 * @param {string} url Supabase Public URL
 * @returns {Promise<boolean>}
 */
export async function cacheTrack(url) {
    if (!('caches' in window) || !url) return false;
    try {
        const cleanUrl = url.split('?')[0];
        const cache = await caches.open(MUSIC_CACHE_NAME);
        
        // Kiểm tra xem đã có sẵn trong cache chưa
        const isCached = await isTrackCached(cleanUrl);
        if (isCached) return true;

        console.log('[CacheHelper] Đang nạp bài hát vào Cache API:', cleanUrl);
        const response = await fetch(cleanUrl, { mode: 'cors' });
        if (response.ok && (response.status === 200 || response.status === 206)) {
            await cache.put(cleanUrl, response.clone());
            console.log('[CacheHelper] Đã lưu bài hát thành công để nghe Offline:', cleanUrl);
            return true;
        }
        return false;
    } catch (e) {
        console.warn('[CacheHelper] Thất bại khi nạp bài hát vào Cache API:', e);
        return false;
    }
}

/**
 * Tải toàn bộ danh sách bài hát vào bộ nhớ Offline chạy nền
 * @param {Array} tracks 
 * @param {Function} onProgress 
 */
export async function cacheAllTracks(tracks, onProgress) {
    if (!Array.isArray(tracks) || tracks.length === 0) return;
    let completed = 0;
    for (const track of tracks) {
        if (track && track.supabaseUrl) {
            await cacheTrack(track.supabaseUrl);
            completed++;
            if (onProgress) {
                onProgress(completed, tracks.length);
            }
        }
    }
}

/**
 * Lấy danh sách tất cả các URL bài hát hiện có trong mọi Cache âm thanh
 * @returns {Promise<string[]>}
 */
export async function getCachedTrackUrls() {
    if (!('caches' in window)) return [];
    try {
        const urls = new Set();
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
            if (name.includes('music')) {
                const cache = await caches.open(name);
                const requests = await cache.keys();
                requests.forEach(req => {
                    const u = typeof req === 'string' ? req : req.url;
                    urls.add(u.split('?')[0]);
                });
            }
        }
        return Array.from(urls);
    } catch (e) {
        console.error('Lỗi khi lấy danh sách cache:', e);
        return [];
    }
}

/**
 * Xóa một bài hát khỏi Cache API khi gỡ khỏi Playlist
 * @param {string} url Supabase Public URL
 */
export async function removeTrackFromCache(url) {
    if (!('caches' in window) || !url) return;
    try {
        const cleanUrl = url.split('?')[0];
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
            if (name.includes('music')) {
                const cache = await caches.open(name);
                await cache.delete(cleanUrl);
            }
        }
        console.log('[CacheHelper] Đã xóa bài hát khỏi Cache API:', cleanUrl);
    } catch (e) {
        console.warn('Lỗi khi xóa bài khỏi cache:', e);
    }
}

/**
 * Đồng bộ Cache API chỉ giữ lại những bài có trong Playlist của tài khoản hiện tại.
 * Xóa bỏ những bài hát mượn/dư thừa từ tài khoản trước hoặc các bài chưa được "+ Thêm".
 * @param {Array} userPlaylist Danh sách bài hát trong Playlist của user
 */
export async function syncUserCache(userPlaylist = []) {
    if (!('caches' in window)) return;
    try {
        const allowedUrls = new Set(
            userPlaylist
                .map(t => t.supabaseUrl ? t.supabaseUrl.split('?')[0] : null)
                .filter(Boolean)
        );
        const cache = await caches.open(MUSIC_CACHE_NAME);
        const requests = await cache.keys();
        for (const req of requests) {
            const cleanReqUrl = req.url.split('?')[0];
            if (!allowedUrls.has(cleanReqUrl)) {
                await cache.delete(req);
                console.log('[CacheHelper] Đã dọn dẹp bài không thuộc Playlist khỏi Cache:', cleanReqUrl);
            }
        }
    } catch (e) {
        console.warn('Lỗi đồng bộ dọn dẹp Cache theo tài khoản:', e);
    }
}
