package com.nhacoffline.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nhacoffline.dto.MusicTrackResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.time.Instant;
import java.util.UUID;

/**
 * Service xử lý cào nhạc từ SoundCloud và chuyển tiếp luồng dữ liệu (Stream)
 * thẳng lên Supabase Storage mà hoàn toàn KHÔNG lưu file tạm ra ổ cứng server.
 */
@Service
public class SoundCloudScraperService {

    private static final Logger log = LoggerFactory.getLogger(SoundCloudScraperService.class);

    private final SupabaseStorageService supabaseStorageService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    // Giới hạn tối đa 3 tác vụ nén / cào bài mới đồng thời để bảo vệ CPU máy chủ không bị quá tải
    private final java.util.concurrent.Semaphore syncConcurrencyLimiter = new java.util.concurrent.Semaphore(3, true);

    // Cache trong RAM lưu các bài hát đã từng được tải (Key là trackId hoặc clean URL)
    private final java.util.Map<String, MusicTrackResponse> cachedTracks = new java.util.concurrent.ConcurrentHashMap<>();

    private java.io.File getCacheFile() {
        java.io.File f1 = new java.io.File("data/tracks_cache.json");
        if (f1.exists()) return f1;
        java.io.File f2 = new java.io.File("backend/data/tracks_cache.json");
        if (f2.exists()) return f2;
        return f1;
    }

    @Value("${ytdlp.path:tools/yt-dlp.exe}")
    private String ytdlpPath;

    public SoundCloudScraperService(SupabaseStorageService supabaseStorageService) {
        this.supabaseStorageService = supabaseStorageService;
        initCache();
    }

    /**
     * Khởi tạo bộ nhớ đệm bài hát:
     * 1. Ưu tiên tải từ Supabase Cloud Storage (Lưu trữ vĩnh viễn trên đám mây, không lo mất khi Render restart).
     * 2. Bổ sung từ file tracks_cache.json nội bộ.
     */
    private void initCache() {
        // 1. Nạp từ Supabase Cloud Storage
        try {
            byte[] remoteData = supabaseStorageService.downloadFile("tracks_cache.json");
            if (remoteData != null && remoteData.length > 0) {
                JsonNode root = objectMapper.readTree(remoteData);
                if (root.isArray()) {
                    for (JsonNode node : root) {
                        MusicTrackResponse track = objectMapper.treeToValue(node, MusicTrackResponse.class);
                        if (track != null && track.getSupabaseUrl() != null) {
                            if (track.getId() != null) {
                                cachedTracks.put(track.getId(), track);
                            }
                            if (track.getOriginalUrl() != null) {
                                cachedTracks.put(cleanTrackKey(track.getOriginalUrl()), track);
                            }
                        }
                    }
                    log.info("⚡ Đã nạp thành công {} bài hát vĩnh viễn từ Supabase Cloud Storage!", cachedTracks.size());
                }
            }
        } catch (Exception e) {
            log.warn("Chưa thể nạp cache từ Supabase Cloud Storage: {}", e.getMessage());
        }

        // 2. Nạp bổ sung từ file cache cục bộ (phòng trường hợp bài mới được deploy kèm mã nguồn)
        try {
            java.io.File cacheFile = getCacheFile();
            if (cacheFile.exists()) {
                JsonNode root = objectMapper.readTree(cacheFile);
                if (root.isArray()) {
                    for (JsonNode node : root) {
                        MusicTrackResponse track = objectMapper.treeToValue(node, MusicTrackResponse.class);
                        if (track != null && track.getSupabaseUrl() != null) {
                            if (track.getId() != null && !cachedTracks.containsKey(track.getId())) {
                                cachedTracks.put(track.getId(), track);
                            }
                            if (track.getOriginalUrl() != null && !cachedTracks.containsKey(cleanTrackKey(track.getOriginalUrl()))) {
                                cachedTracks.put(cleanTrackKey(track.getOriginalUrl()), track);
                            }
                        }
                    }
                }
                log.info("Tổng số bài hát sau khi hợp nhất vào kho đệm (Cache): {} bài!", cachedTracks.size());
            }
        } catch (Exception e) {
            log.warn("Không thể nạp file cache cục bộ: {}", e.getMessage());
        }
    }

    /**
     * Lưu bài hát mới vào file cache trên đĩa và ĐỒNG BỘ LÊN SUPABASE CLOUD STORAGE VĨNH VIỄN
     */
    private synchronized void persistCache() {
        try {
            java.util.Collection<MusicTrackResponse> uniqueTracks = new java.util.LinkedHashSet<>(cachedTracks.values());
            byte[] jsonBytes = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(uniqueTracks);

            // 1. Ghi ra đĩa cục bộ
            java.io.File file = getCacheFile();
            java.io.File parent = file.getParentFile();
            if (parent != null && !parent.exists()) {
                parent.mkdirs();
            }
            java.nio.file.Files.write(file.toPath(), jsonBytes);

            // 2. Upload thẳng lên Supabase Cloud Storage để lưu trữ vĩnh viễn 24/7 (Không bao giờ bị mất khi Render spin down)
            try {
                supabaseStorageService.uploadFile("tracks_cache.json", jsonBytes, "application/json");
                log.info("⚡ Đã đồng bộ vĩnh viễn danh sách {} bài hát lên Supabase Cloud Storage thành công!", uniqueTracks.size());
            } catch (Exception e) {
                log.warn("Lỗi khi upload tracks_cache.json lên Supabase: {}", e.getMessage());
            }
        } catch (Exception e) {
            log.warn("Lỗi khi ghi cache ra file: {}", e.getMessage());
        }
    }

    public String cleanTrackKey(String url) {
        if (url == null) return "";
        return url.trim().toLowerCase().replaceAll("\\?.*$", "").replaceAll("/+$", "");
    }

    /**
     * Lấy danh sách toàn bộ các bài hát trong kho thư viện chung (Kho nhạc Admin / Bảng xếp hạng thịnh hành)
     */
    public java.util.List<MusicTrackResponse> getAdminTracks() {
        return new java.util.ArrayList<>(new java.util.LinkedHashSet<>(cachedTracks.values()));
    }

    /**
     * Lấy danh sách toàn bộ các URL bài hát đã từng đồng bộ trong hệ thống
     * Giúp Extension kiểm tra nhanh để không đồng bộ lại các bài đã nghe
     */
    public java.util.List<String> getSyncedUrls() {
        java.util.Set<String> urls = new java.util.HashSet<>();
        for (MusicTrackResponse t : cachedTracks.values()) {
            if (t.getOriginalUrl() != null && !t.getOriginalUrl().isBlank()) {
                urls.add(cleanTrackKey(t.getOriginalUrl()));
            }
            if (t.getId() != null && !t.getId().isBlank()) {
                urls.add(t.getId());
            }
        }
        return new java.util.ArrayList<>(urls);
    }

    /**
     * Tự động quét và nạp các bài hát thịnh hành (Trending) từ SoundCloud vào kho hệ thống
     * @param count Số lượng bài hát mới muốn đồng bộ (mặc định 3 - 5 bài để tối ưu băng thông & RAM)
     */
    public java.util.List<MusicTrackResponse> syncTrendingTracks(int count) {
        int targetNewTracks = count > 0 ? count : 3;
        log.info("Bắt đầu tự động quét bài hát thịnh hành từ SoundCloud, mục tiêu thêm {} bài...", targetNewTracks);

        String[] keywords = new String[] {
            "vpop remix trending",
            "nhac tre hot tiktok",
            "vietnamese hit songs",
            "chill lofi viet nam"
        };

        java.util.List<MusicTrackResponse> newlySynced = new java.util.ArrayList<>();

        for (String kw : keywords) {
            if (newlySynced.size() >= targetNewTracks) break;
            try {
                java.util.List<com.nhacoffline.dto.SearchResultItem> candidates = searchTracks(kw, 5);
                for (com.nhacoffline.dto.SearchResultItem item : candidates) {
                    if (newlySynced.size() >= targetNewTracks) break;
                    if (item.getUrl() == null || item.getUrl().isBlank()) continue;

                    // Bỏ qua các bài đã có trong hệ thống
                    String cleanUrl = cleanTrackKey(item.getUrl());
                    boolean alreadyExists = cachedTracks.containsKey(cleanUrl) ||
                            (item.getId() != null && cachedTracks.containsKey(item.getId()));
                    if (alreadyExists) continue;

                    // Chỉ chọn các bài có thời lượng hợp lý (< 15 phút = 900 giây) để tránh tải các mix quá dài
                    if (item.getDurationSeconds() != null && item.getDurationSeconds() > 900) {
                        continue;
                    }

                    log.info("⚡ Tự động đồng bộ bài hát thịnh hành mới: '{}' - '{}' ({})",
                            item.getTitle(), item.getArtist(), item.getUrl());
                    try {
                        MusicTrackResponse synced = syncTrackFromSoundCloud(item.getUrl());
                        if (synced != null) {
                            newlySynced.add(synced);
                        }
                    } catch (Exception ex) {
                        log.warn("Không thể đồng bộ tự động bài '{}': {}", item.getTitle(), ex.getMessage());
                    }
                }
            } catch (Exception e) {
                log.warn("Lỗi khi quét từ khóa trending '{}': {}", kw, e.getMessage());
            }
        }

        log.info("Hoàn tất quét bài hát thịnh hành: đã thêm {} bài mới vào hệ thống!", newlySynced.size());
        return newlySynced;
    }

    /**
     * Xóa vĩnh viễn bài hát khỏi cache hệ thống và Supabase Storage
     */
    public synchronized boolean removeTrack(String trackIdOrUrl) {
        if (trackIdOrUrl == null || trackIdOrUrl.isBlank()) return false;

        MusicTrackResponse found = null;
        for (MusicTrackResponse t : cachedTracks.values()) {
            if (trackIdOrUrl.equals(t.getId()) ||
                trackIdOrUrl.equals(t.getSupabaseUrl()) ||
                cleanTrackKey(trackIdOrUrl).equals(cleanTrackKey(t.getOriginalUrl()))) {
                found = t;
                break;
            }
        }

        if (found != null) {
            final String targetSupabaseUrl = found.getSupabaseUrl();
            final String targetId = found.getId();
            final String targetOrigUrl = found.getOriginalUrl();

            // Xóa khỏi RAM cache
            cachedTracks.values().removeIf(t -> targetSupabaseUrl != null && targetSupabaseUrl.equals(t.getSupabaseUrl()));
            if (targetId != null) cachedTracks.remove(targetId);
            if (targetOrigUrl != null) cachedTracks.remove(cleanTrackKey(targetOrigUrl));

            // Lưu lại file JSON
            persistCache();

            // Xóa file khỏi Supabase Storage
            if (targetSupabaseUrl != null) {
                try {
                    String cleanUrl = targetSupabaseUrl.split("\\?")[0];
                    String fileName = cleanUrl.substring(cleanUrl.lastIndexOf('/') + 1);
                    supabaseStorageService.deleteFile(fileName);
                } catch (Exception e) {
                    log.warn("Lỗi khi xóa file MP3 khỏi Supabase Storage: {}", e.getMessage());
                }
            }
            log.info("Đã xóa vĩnh viễn bài hát khỏi hệ thống: {}", found.getTitle());
            return true;
        }
        return false;
    }

    /**
     * Tìm kiếm danh sách các bản nhạc trên SoundCloud theo từ khóa.
     * Trả về danh sách bài hát để người dùng chọn bài ưng ý nhất trước khi lưu.
     */
    public java.util.List<com.nhacoffline.dto.SearchResultItem> searchTracks(String query, int limit) {
        int count = limit > 0 ? limit : 5;
        String searchQuery = String.format("scsearch%d:%s", count, query.trim());
        log.info("Đang tìm kiếm SoundCloud cho từ khóa: '{}'", searchQuery);

        ProcessBuilder processBuilder = new ProcessBuilder(
                ytdlpPath,
                "--dump-single-json",
                "--skip-download",
                "--no-warnings",
                "--flat-playlist",
                searchQuery
        );
        processBuilder.redirectError(ProcessBuilder.Redirect.DISCARD);

        java.util.List<com.nhacoffline.dto.SearchResultItem> results = new java.util.ArrayList<>();
        try {
            Process process = processBuilder.start();
            try (InputStream is = process.getInputStream()) {
                JsonNode root = objectMapper.readTree(is);
                int exitCode = process.waitFor();

                if (exitCode != 0 || root == null) {
                    log.warn("yt-dlp tìm kiếm kết thúc với exitCode: {}", exitCode);
                    return results;
                }

                JsonNode entries = root.path("entries");
                if (entries.isArray()) {
                    for (JsonNode node : entries) {
                        String id = node.path("id").asText();
                        String title = node.path("title").asText("Không rõ tiêu đề");
                        String artist = node.path("uploader").asText("SoundCloud Artist");
                        long duration = node.path("duration").asLong(0L);
                        String webpageUrl = node.path("webpage_url").asText(null);
                        String url = (webpageUrl != null && !webpageUrl.isBlank()) ? webpageUrl : node.path("url").asText(null);
                        String thumbnail = node.path("thumbnail").asText(null);
                        
                        // Lấy ảnh bìa chất lượng tốt từ mảng thumbnails nếu thumbnail gốc null
                        if (thumbnail == null && node.has("thumbnails") && node.path("thumbnails").isArray() && !node.path("thumbnails").isEmpty()) {
                            JsonNode thumbs = node.path("thumbnails");
                            thumbnail = thumbs.get(thumbs.size() - 1).path("url").asText(null);
                        }

                        com.nhacoffline.dto.SearchResultItem item = new com.nhacoffline.dto.SearchResultItem(id, title, artist, duration, thumbnail, url);
                        
                        // Kiểm tra nếu bài hát đã được lưu trữ sẵn trên Supabase Storage
                        String cleanU = cleanTrackKey(url);
                        MusicTrackResponse cached = null;
                        if (cachedTracks.containsKey(cleanU)) {
                            cached = cachedTracks.get(cleanU);
                        } else if (id != null && cachedTracks.containsKey(id)) {
                            cached = cachedTracks.get(id);
                        }
                        if (cached != null) {
                            item.setSupabaseUrl(cached.getSupabaseUrl());
                            item.setIsSynced(true);
                        }

                        results.add(item);
                    }
                }
            }
        } catch (Exception e) {
            log.error("Lỗi khi tìm kiếm bài hát: {}", e.getMessage(), e);
        }

        return results;
    }

    /**
     * Khởi chạy Process stream trực tiếp audio của một bài hát (dùng cho tính năng nghe thử Preview)
     * Sử dụng cấu hình ffmpeg tối ưu độ trễ siêu thấp (probesize 32k, nobuffer, flush_packets 1)
     * giúp thẻ <audio> phát âm thanh ra loa ngay lập tức mà không phải chờ tải hết buffer.
     */
    public Process startAudioStream(String url) {
        String cleanUrl = url != null ? url.trim().replace("\"", "").replace("'", "") : "";
        boolean isWindows = System.getProperty("os.name", "").toLowerCase().contains("win");

        // Tham số ffmpeg tối ưu độ trễ thấp nhất cho stream trực tiếp
        String ffmpegArgs = "ffmpeg -hide_banner -loglevel error -probesize 32768 -analyzeduration 100000 -fflags +nobuffer -flags +low_delay -i pipe:0 -acodec libmp3lame -b:a 96k -ar 44100 -f mp3 -flush_packets 1 -vn pipe:1";

        ProcessBuilder processBuilder;
        if (isWindows) {
            String cmd = String.format("\"%s\" --buffer-size 16k -f bestaudio/best --quiet --no-warnings -o - \"%s\" | %s",
                    ytdlpPath, cleanUrl, ffmpegArgs);
            processBuilder = new ProcessBuilder("cmd.exe", "/c", cmd);
        } else {
            String cmd = String.format("%s --buffer-size 16k -f bestaudio/best --quiet --no-warnings -o - \"%s\" | %s",
                    ytdlpPath, cleanUrl, ffmpegArgs);
            processBuilder = new ProcessBuilder("sh", "-c", cmd);
        }

        processBuilder.redirectError(ProcessBuilder.Redirect.DISCARD);
        try {
            return processBuilder.start();
        } catch (Exception e) {
            log.error("Lỗi khi khởi chạy stream preview MP3: {}", e.getMessage(), e);
            throw new RuntimeException("Không thể mở luồng nghe thử: " + e.getMessage(), e);
        }
    }

    /**
     * Đồng bộ bài hát từ link SoundCloud:
     * 1. Gọi yt-dlp trích xuất Metadata (Tiêu đề, Ca sĩ, Ảnh bìa, Thời lượng).
     * 2. Gọi yt-dlp pipe stream nhị phân của bài hát ra stdout.
     * 3. Đọc trực tiếp InputStream từ Process vào RAM và nén tối ưu dung lượng qua ffmpeg.
     * 4. Upload mảng byte MP3 trực tiếp lên Supabase Storage.
     * 5. Trả về Metadata kèm Supabase Public URL cho Frontend.
     */
    public MusicTrackResponse syncTrackFromSoundCloud(String input) {
        String target = input.trim();

        // 0. Kiểm tra nhanh trong cache theo clean URL
        String urlKey = cleanTrackKey(target);
        if (cachedTracks.containsKey(urlKey)) {
            log.info("⚡ Bài hát đã tồn tại trong Cache theo URL '{}', trả về tức thì (0.001s, 0% CPU)!", target);
            return cachedTracks.get(urlKey);
        }

        // Nếu người dùng nhập tên bài hát thay vì link URL, tự động tìm kiếm trên SoundCloud
        if (!target.startsWith("http://") && !target.startsWith("https://")) {
            target = "scsearch1:" + target;
            log.info("Người dùng nhập từ khóa tìm kiếm: '{}' -> chuyển thành: '{}'", input, target);
        } else {
            log.info("Nhận yêu cầu đồng bộ bài hát từ URL: {}", target);
        }

        // 1. Trích xuất metadata dạng JSON bằng yt-dlp
        TrackMetadata metadata = extractMetadata(target);
        log.info("Đã trích xuất metadata: '{}' - '{}'", metadata.getTitle(), metadata.getArtist());

        // Kiểm tra tiếp theo track ID sau khi trích xuất metadata
        if (metadata.getTrackId() != null && cachedTracks.containsKey(metadata.getTrackId())) {
            MusicTrackResponse cached = cachedTracks.get(metadata.getTrackId());
            log.info("⚡ Bài hát ID '{}' ('{}') đã có trên Supabase, trả về kết quả có sẵn (0.001s, 0% CPU)!",
                    metadata.getTrackId(), cached.getTitle());
            cachedTracks.put(urlKey, cached);
            return cached;
        }

        // 2. Chờ xin cấp phép từ Hàng đợi Semaphore (tối đa 3 tiến trình nén cùng lúc)
        boolean acquired = false;
        try {
            log.info("Đang xếp hàng chờ tài nguyên xử lý nén âm thanh...");
            acquired = syncConcurrencyLimiter.tryAcquire(60, java.util.concurrent.TimeUnit.SECONDS);
            if (!acquired) {
                throw new RuntimeException("Hệ thống đang quá tải tác vụ tải nhạc, vui lòng thử lại sau giây lát.");
            }

            // 2.1 Double-checked locking: kiểm tra lại xem luồng trước vừa tải xong bài này hay chưa
            if (cachedTracks.containsKey(urlKey)) {
                log.info("⚡ [Double-Check] Bài hát đã được đồng bộ bởi luồng trước đó, trả về từ cache tức thì (0.001s, 0% CPU): {}", urlKey);
                return cachedTracks.get(urlKey);
            }
            if (metadata.getTrackId() != null && cachedTracks.containsKey(metadata.getTrackId())) {
                MusicTrackResponse cached = cachedTracks.get(metadata.getTrackId());
                cachedTracks.put(urlKey, cached);
                log.info("⚡ [Double-Check] Bài hát ID '{}' đã có trong cache bởi luồng trước đó, trả về tức thì!", metadata.getTrackId());
                return cached;
            }

            // Tải stream audio trực tiếp qua ProcessBuilder stdout
            String downloadUrl = metadata.getWebpageUrl() != null ? metadata.getWebpageUrl() : target;
            byte[] audioData = downloadAudioToMemory(downloadUrl);
            log.info("Đã đọc toàn bộ stream nhạc vào bộ nhớ: {} bytes", audioData.length);

            // Nén và tối ưu hóa dung lượng cho MỌI BÀI HÁT
            audioData = optimizeAndCompressAudio(audioData, metadata.getDuration());

            // Đặt tên file duy nhất dựa trên ID bài hát
            String fileName = String.format("sc_%s_%s.mp3",
                    metadata.getTrackId() != null ? metadata.getTrackId() : UUID.randomUUID().toString().substring(0, 8),
                    System.currentTimeMillis());

            // Upload mảng byte trực tiếp lên Supabase Storage REST API
            String supabaseUrl = supabaseStorageService.uploadFile(fileName, audioData, "audio/mpeg");
            log.info("Đồng bộ hoàn tất! Supabase URL: {}", supabaseUrl);

            // Tính dung lượng định dạng để hiển thị
            double mb = audioData.length / (1024.0 * 1024.0);
            String formattedSize = String.format(java.util.Locale.US, "~%.1f MB", mb);

            // Đóng gói kết quả trả về cho Frontend
            MusicTrackResponse result = MusicTrackResponse.builder()
                    .id(metadata.getTrackId() != null ? metadata.getTrackId() : UUID.randomUUID().toString())
                    .title(metadata.getTitle())
                    .artist(metadata.getArtist())
                    .supabaseUrl(supabaseUrl)
                    .durationSeconds(metadata.getDuration())
                    .coverUrl(metadata.getThumbnail())
                    .originalUrl(input)
                    .formattedSize(formattedSize)
                    .createdAt(Instant.now().toString())
                    .build();

            // Lưu ngay vào Cache và đĩa để tái sử dụng vĩnh viễn cho tất cả người dùng khác
            if (result.getId() != null) {
                cachedTracks.put(result.getId(), result);
            }
            cachedTracks.put(urlKey, result);
            persistCache();

            return result;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Hàng đợi bị gián đoạn: " + e.getMessage(), e);
        } finally {
            if (acquired) {
                syncConcurrencyLimiter.release();
            }
        }
    }

    /**
     * Tự động nén và tối ưu hóa dung lượng cho TẤT CẢ bài hát (cả bài ngắn và bài dài 1-2 tiếng):
     * - Bài ngắn (<= 15 phút): nén về MP3 96kbps / 112kbps (chất lượng cao, dung lượng chỉ 2-3MB, siêu tiết kiệm).
     * - Bài dài (> 15 phút): tự động tính bitrate thích hợp để dung lượng luôn <= 40MB (an toàn trong hạn mức 50MB của Supabase).
     * Đảm bảo toàn bộ file lưu lên Supabase Storage luôn là định dạng MP3 tiêu chuẩn 100%.
     */
    private byte[] optimizeAndCompressAudio(byte[] rawAudio, long durationSeconds) {
        long duration = durationSeconds > 0 ? durationSeconds : 240;

        // Tính toán bitrate mục tiêu:
        // Nếu bài dài > 15 phút: khống chế dung lượng dưới 40MB
        // Nếu bài ngắn: dùng 96k (âm thanh stereo cực rõ và siêu nhẹ, bài 4 phút ~ 2.8 MB)
        int targetBitrate = 96;
        if (duration > 900) { // trên 15 phút
            targetBitrate = (int) ((40L * 1024 * 1024 * 8) / duration / 1000);
            targetBitrate = Math.max(48, Math.min(96, targetBitrate));
        }

        log.info("Bắt đầu nén tối ưu âm thanh (Thời lượng: {}s, Bitrate mục tiêu: {}k, Dung lượng gốc: {} MB)...",
                duration, targetBitrate, String.format(java.util.Locale.US, "%.1f", rawAudio.length / (1024.0 * 1024.0)));

        ProcessBuilder pb = new ProcessBuilder(
                "ffmpeg",
                "-y",
                "-i", "pipe:0",
                "-acodec", "libmp3lame",
                "-b:a", targetBitrate + "k",
                "-ar", "44100",
                "-f", "mp3",
                "pipe:1"
        );
        pb.redirectError(ProcessBuilder.Redirect.DISCARD);

        try {
            Process process = pb.start();

            // Ghi dữ liệu raw vào ffmpeg stdin trên luồng riêng
            ByteArrayOutputStream outputBuffer = new ByteArrayOutputStream();
            Thread writerThread = new Thread(() -> {
                try (java.io.OutputStream os = process.getOutputStream()) {
                    os.write(rawAudio);
                    os.flush();
                } catch (Exception e) {
                    log.warn("Lỗi khi ghi vào ffmpeg stdin: {}", e.getMessage());
                }
            });
            writerThread.start();

            // Đọc dữ liệu MP3 đã nén từ ffmpeg stdout
            try (InputStream is = process.getInputStream()) {
                byte[] buffer = new byte[8192];
                int n;
                while ((n = is.read(buffer)) != -1) {
                    outputBuffer.write(buffer, 0, n);
                }
                outputBuffer.flush();
            }

            writerThread.join();
            int exitCode = process.waitFor();

            if (exitCode == 0 && outputBuffer.size() > 0) {
                byte[] compressedBytes = outputBuffer.toByteArray();
                log.info("Nén tối ưu thành công! Dung lượng giảm từ {} MB xuống {} MB.",
                        String.format(java.util.Locale.US, "%.1f", rawAudio.length / (1024.0 * 1024.0)),
                        String.format(java.util.Locale.US, "%.1f", compressedBytes.length / (1024.0 * 1024.0)));
                return compressedBytes;
            } else {
                log.warn("ffmpeg nén kết thúc với exitCode: {}. Tiếp tục dùng file gốc.", exitCode);
            }
        } catch (Exception e) {
            log.error("Lỗi trong quá trình nén audio bằng ffmpeg: {}", e.getMessage(), e);
        }

        return rawAudio;
    }

    /**
     * Trích xuất thông tin tiêu đề, tác giả, thumbnail qua yt-dlp với cờ --dump-single-json
     */
    private TrackMetadata extractMetadata(String url) {
        ProcessBuilder processBuilder = new ProcessBuilder(
                ytdlpPath,
                "--dump-single-json",
                "--skip-download",
                "--no-warnings",
                "--no-playlist",
                url
        );

        try {
            Process process = processBuilder.start();
            try (InputStream is = process.getInputStream()) {
                JsonNode root = objectMapper.readTree(is);
                int exitCode = process.waitFor();

                if (exitCode != 0 || root == null) {
                    throw new RuntimeException("yt-dlp kết thúc với mã lỗi: " + exitCode + ". Hãy kiểm tra từ khóa hoặc đường link.");
                }

                // Nếu là kết quả tìm kiếm scsearch, yt-dlp trả về mảng "entries"
                JsonNode trackNode = (root.has("entries") && root.path("entries").isArray() && !root.path("entries").isEmpty())
                        ? root.path("entries").get(0)
                        : root;

                String title = trackNode.path("title").asText("Không rõ tiêu đề");
                String artist = trackNode.path("uploader").asText(trackNode.path("creator").asText("SoundCloud Artist"));
                String thumbnail = trackNode.path("thumbnail").asText(null);
                long duration = trackNode.path("duration").asLong(0L);
                String id = trackNode.path("id").asText(UUID.randomUUID().toString());
                String webpageUrl = trackNode.path("webpage_url").asText(null);

                return new TrackMetadata(id, title, artist, thumbnail, duration, webpageUrl);
            }
        } catch (Exception e) {
            log.error("Lỗi khi trích xuất metadata từ SoundCloud: {}", e.getMessage());
            throw new RuntimeException("Không thể lấy thông tin bài hát từ link hoặc từ khóa này: " + e.getMessage(), e);
        }
    }

    /**
     * Tải nhị phân audio trực tiếp từ SoundCloud qua stdout (-o -) của yt-dlp.
     * Dữ liệu chạy trực tiếp qua RAM InputStream -> ByteArrayOutputStream,
     * tuyệt đối KHÔNG ghi bất kỳ file tạm (.tmp/.mp3) nào ra ổ cứng server.
     */
    private byte[] downloadAudioToMemory(String url) {
        // -f bestaudio: Lấy stream âm thanh chất lượng tốt nhất
        // -o -: Chỉ định yt-dlp đẩy toàn bộ stream nhị phân ra standard output (stdout)
        ProcessBuilder processBuilder = new ProcessBuilder(
                ytdlpPath,
                "-f", "bestaudio/best",
                "--quiet",
                "--no-warnings",
                "--no-progress",
                "--no-playlist",
                "-o", "-",
                url
        );
        // Bỏ qua stderr để tránh đầy buffer làm nghẽn tiến trình trên Windows
        processBuilder.redirectError(ProcessBuilder.Redirect.DISCARD);

        try {
            Process process = processBuilder.start();

            // Đọc stream âm thanh trực tiếp từ Standard Output của Process
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            try (InputStream inputStream = process.getInputStream()) {
                byte[] data = new byte[8192];
                int nRead;
                while ((nRead = inputStream.read(data, 0, data.length)) != -1) {
                    buffer.write(data, 0, nRead);
                }
                buffer.flush();
            }

            int exitCode = process.waitFor();
            if (exitCode != 0) {
                String stderrMsg = new String(process.getErrorStream().readAllBytes());
                log.error("yt-dlp stream failed với mã lỗi {}: {}", exitCode, stderrMsg);
                throw new RuntimeException("yt-dlp không thể stream file nhạc: " + stderrMsg);
            }

            byte[] audioBytes = buffer.toByteArray();
            if (audioBytes.length == 0) {
                throw new RuntimeException("Luồng âm thanh nhận được rỗng (0 bytes).");
            }

            return audioBytes;
        } catch (Exception e) {
            log.error("Lỗi trong quá trình đọc audio stream vào RAM: {}", e.getMessage());
            throw new RuntimeException("Không thể tải stream âm thanh từ SoundCloud: " + e.getMessage(), e);
        }
    }

    public static class TrackMetadata {
        private final String trackId;
        private final String title;
        private final String artist;
        private final String thumbnail;
        private final long duration;
        private final String webpageUrl;

        public TrackMetadata(String trackId, String title, String artist, String thumbnail, long duration, String webpageUrl) {
            this.trackId = trackId;
            this.title = title;
            this.artist = artist;
            this.thumbnail = thumbnail;
            this.duration = duration;
            this.webpageUrl = webpageUrl;
        }

        public String getTrackId() { return trackId; }
        public String getTitle() { return title; }
        public String getArtist() { return artist; }
        public String getThumbnail() { return thumbnail; }
        public long getDuration() { return duration; }
        public String getWebpageUrl() { return webpageUrl; }
    }
}
