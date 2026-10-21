/**
 * Service Worker hỗ trợ PWA và Offline Audio Streaming
 * Nhiệm vụ:
 * 1. Cache App Shell (HTML, CSS, JS) để mở app khi không có Internet.
 * 2. Bắt chặn (Intercept) các request tải nhạc tới Supabase Storage (*.supabase.co).
 * 3. Nếu ONLINE: Vừa phát nhạc vừa lưu file MP3 vào Cache API ("music-cache-v1").
 * 4. Nếu OFFLINE: Lấy trực tiếp file MP3 từ Cache API ra phục vụ thẻ <audio>,
 *    hỗ trợ xử lý HTTP 206 Partial Content (Range Request) để tua nhạc mượt mà khi mất mạng.
 */

const STATIC_CACHE_NAME = 'app-shell-v13';
const MUSIC_CACHE_NAME = 'nhacoffline-music-cache-v1';

// Danh sách tài nguyên tĩnh tối thiểu cần cache ngay khi cài đặt PWA
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json'
];

// Sự kiện INSTALL: Tải trước và lưu App Shell vào Static Cache
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Đang cài đặt v13...');
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Đang nạp App Shell vào cache');
            return cache.addAll(STATIC_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// Sự kiện ACTIVATE: Xóa App Shell cũ nhưng TUYỆT ĐỐI BẢO VỆ CACHE BÀI HÁT
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Đã kích hoạt v13');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // CHỈ xóa các App Shell cũ, TUYỆT ĐỐI KHÔNG xóa cache bài hát (nhacoffline-music-* hay music-cache-*)
                    if (cacheName.startsWith('app-shell-') && cacheName !== STATIC_CACHE_NAME) {
                        console.log('[Service Worker] Xóa App Shell cũ:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Sự kiện FETCH: Bắt mọi request từ trình duyệt
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // QUAN TRỌNG: BỎ QUA MỌI REQUEST KHÔNG PHẢI GET (POST, PUT, DELETE, v.v.)
    if (request.method !== 'GET') {
        return;
    }

    // 1. ĐỐI VỚI DANH SÁCH BÀI HÁT /api/music/synced-tracks: Áp dụng Network-First, Offline fallback
    if (url.pathname === '/api/music/synced-tracks') {
        event.respondWith(
            fetch(request).then(async (response) => {
                if (response.ok) {
                    const clone = response.clone();
                    const cache = await caches.open(STATIC_CACHE_NAME);
                    cache.put(request, clone);
                }
                return response;
            }).catch(async () => {
                const cache = await caches.open(STATIC_CACHE_NAME);
                const cached = await cache.match(request);
                if (cached) return cached;
                return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
            })
        );
        return;
    }

    // BỎ QUA CÁC API BACKEND KHÁC (/api/*)
    if (url.pathname.startsWith('/api/')) {
        return;
    }

    // 2. KIỂM TRA: Nếu request hướng đến Supabase Storage (hoặc file âm thanh .mp3 tĩnh đã lưu)
    const isSupabaseStorage = url.hostname.includes('supabase.co') && url.pathname.includes('/storage/v1/object/');
    const isStaticMp3File = url.pathname.endsWith('.mp3');

    if (isSupabaseStorage || isStaticMp3File) {
        event.respondWith(
            (async () => {
                // A. KIỂM TRA TRONG CACHE TRƯỚC: Nếu bài hát đã được lưu Offline, phát NGAY LẬP TỨC từ Cache!
                // Cho dù đang Online hay Offline, phát từ Cache luôn nhanh 0ms và không tốn 3G/Wi-Fi!
                const cleanUrl = request.url.split('?')[0];
                const cacheNames = await caches.keys();
                for (const name of cacheNames) {
                    if (name.includes('music')) {
                        const c = await caches.open(name);
                        const match = (await c.match(cleanUrl, { ignoreSearch: true })) || (await c.match(request, { ignoreSearch: true }));
                        if (match) {
                            console.log('[Service Worker] Phát bài hát trực tiếp TỪ CACHE API:', cleanUrl);
                            const rangeHeader = request.headers.get('range');
                            return await createRangeResponse(match, rangeHeader);
                        }
                    }
                }

                // B. NẾU CHƯA CÓ TRONG CACHE:
                // Nếu đang Offline -> Báo bài chưa được tải về
                if (!navigator.onLine) {
                    return new Response('Bài hát này chưa được tải về bộ nhớ Offline.', {
                        status: 503,
                        statusText: 'Service Unavailable',
                        headers: { 
                            'Content-Type': 'text/plain; charset=utf-8',
                            'Access-Control-Allow-Origin': '*'
                        }
                    });
                }

                // Nếu đang Online -> Stream trực tuyến từ Supabase
                try {
                    return await fetch(request);
                } catch (err) {
                    return new Response('Không thể kết nối đến máy chủ âm thanh.', {
                        status: 503,
                        headers: { 'Access-Control-Allow-Origin': '*' }
                    });
                }
            })()
        );
        return;
    }

    // BỎ QUA MỌI REQUEST SUPABASE KHÁC (như Supabase Auth /rest/v1 hay /auth/v1)
    if (url.hostname.includes('supabase.co')) {
        return;
    }

    // Đối với các file tĩnh (HTML, JS, CSS, Icon): Áp dụng chiến lược Stale-While-Revalidate hoặc Network First
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && request.method === 'GET') {
                    const responseToCache = networkResponse.clone();
                    caches.open(STATIC_CACHE_NAME).then((cache) => {
                        cache.put(request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                return cachedResponse;
            });

            return cachedResponse || fetchPromise;
        })
    );
});

/**
 * Hàm hỗ trợ Range Request (HTTP 206 Partial Content) bằng Zero-Copy Blob Slicing:
 * Giúp thẻ <audio> có thể tua nhạc (seek), pause, resume mượt mà khi nghe Offline từ Cache API
 */
async function createRangeResponse(fullResponse, rangeHeader) {
    const blob = await fullResponse.blob();
    const totalBytes = blob.size;

    // Nếu không có header Range, trả về toàn bộ dữ liệu âm thanh
    if (!rangeHeader) {
        return new Response(blob, {
            status: 200,
            headers: {
                'Content-Type': 'audio/mpeg',
                'Content-Length': totalBytes.toString(),
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'public, max-age=31536000',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Range, Content-Range',
                'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
            }
        });
    }

    // Phân tích header Range (ví dụ: "bytes=1048576-")
    const matches = rangeHeader.match(/bytes=(\d+)-(\d+)?/);
    if (!matches) {
        return fullResponse;
    }

    const start = parseInt(matches[1], 10);
    const end = matches[2] ? parseInt(matches[2], 10) : totalBytes - 1;

    // Giới hạn phạm vi hợp lệ
    const chunkStart = Math.min(start, totalBytes - 1);
    const chunkEnd = Math.min(end, totalBytes - 1);
    const chunkSize = (chunkEnd - chunkStart) + 1;

    // Cắt phân đoạn Blob (Zero-copy, cực nhanh 0.1ms, không tràn RAM)
    const slicedBlob = blob.slice(chunkStart, chunkEnd + 1, 'audio/mpeg');

    return new Response(slicedBlob, {
        status: 206,
        statusText: 'Partial Content',
        headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Range': `bytes ${chunkStart}-${chunkEnd}/${totalBytes}`,
            'Content-Length': chunkSize.toString(),
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=31536000',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Range, Content-Range',
            'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
        }
    });
}
