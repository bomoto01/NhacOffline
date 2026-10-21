package com.nhacoffline.controller;

import com.nhacoffline.dto.MusicTrackResponse;
import com.nhacoffline.dto.SyncSoundCloudRequest;
import com.nhacoffline.service.SoundCloudScraperService;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Controller xử lý các yêu cầu liên quan đến bài hát và đồng bộ SoundCloud.
 */
@RestController
@RequestMapping("/api/music")
public class MusicController {

    private static final Logger log = LoggerFactory.getLogger(MusicController.class);

    private final SoundCloudScraperService soundCloudScraperService;
    private final com.nhacoffline.service.SupabaseStorageService supabaseStorageService;

    public MusicController(
            SoundCloudScraperService soundCloudScraperService,
            com.nhacoffline.service.SupabaseStorageService supabaseStorageService) {
        this.soundCloudScraperService = soundCloudScraperService;
        this.supabaseStorageService = supabaseStorageService;
    }

    /**
     * API tìm kiếm danh sách bài hát trên SoundCloud theo từ khóa
     * Giúp người dùng xem trước và lựa chọn bản nhạc mong muốn trước khi đồng bộ lưu về
     */
    @GetMapping("/search")
    public ResponseEntity<?> searchTracks(
            @RequestParam("q") String query,
            @RequestParam(value = "limit", defaultValue = "5") int limit) {
        if (query == null || query.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Từ khóa tìm kiếm không được để trống"));
        }
        var list = soundCloudScraperService.searchTracks(query, limit);
        return ResponseEntity.ok(list);
    }

    /**
     * API nghe thử (Preview Stream):
     * Stream trực tiếp audio từ SoundCloud về thẻ <audio> để người dùng nghe thử
     * mà KHÔNG cần lưu lên Supabase Storage.
     */
    @GetMapping("/stream-preview")
    public void streamPreview(
            @RequestParam(value = "url", required = false) String url,
            jakarta.servlet.http.HttpServletResponse response) throws java.io.IOException {
        if (url == null || url.isBlank()) {
            response.sendError(jakarta.servlet.http.HttpServletResponse.SC_BAD_REQUEST, "Tham số 'url' không được để trống");
            return;
        }

        log.info("Bắt đầu mở luồng nghe thử Preview MP3 thuần cho: {}", url);
        Process process = soundCloudScraperService.startAudioStream(url);

        try (java.io.InputStream inputStream = process.getInputStream();
             java.io.OutputStream outputStream = response.getOutputStream()) {

            // Header chuẩn cho luồng MP3 trực tiếp (audio/mpeg)
            response.setContentType("audio/mpeg");
            response.setStatus(jakarta.servlet.http.HttpServletResponse.SC_OK);
            response.setHeader("Accept-Ranges", "none");
            response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
            response.setHeader("Pragma", "no-cache");
            response.setHeader("Expires", "0");
            response.setHeader("Content-Disposition", "inline");
            response.setHeader("Access-Control-Allow-Origin", "*");

            byte[] buffer = new byte[4096];
            int bytesRead;
            boolean isFirst = true;
            while ((bytesRead = inputStream.read(buffer)) != -1) {
                outputStream.write(buffer, 0, bytesRead);
                if (isFirst) {
                    outputStream.flush(); // Đẩy ngay gói MP3 đầu tiên để trình duyệt phát tiếng ra loa tức thì
                    isFirst = false;
                }
            }
            outputStream.flush();
        } catch (Exception e) {
            log.info("Dừng luồng nghe thử: {}", e.getMessage());
        } finally {
            process.destroyForcibly();
        }
    }

    /**
     * API nhận link bài hát từ SoundCloud, cào file nhạc trực tiếp trong RAM,
     * upload lên Supabase Storage và trả về JSON chứa thông tin bài hát cùng public URL.
     *
     * @param request Chứa trường "url" là link SoundCloud
     * @return MusicTrackResponse gồm { id, title, artist, supabaseUrl, durationSeconds, coverUrl }
     */
    @PostMapping("/sync-soundcloud")
    public ResponseEntity<?> syncSoundCloudTrack(@Valid @RequestBody SyncSoundCloudRequest request) {
        log.info("API POST /api/music/sync-soundcloud được gọi với URL: {}", request.getUrl());

        try {
            MusicTrackResponse track = soundCloudScraperService.syncTrackFromSoundCloud(request.getUrl());
            return ResponseEntity.ok(track);
        } catch (Exception e) {
            log.error("Xảy ra lỗi trong quá trình đồng bộ: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().body(Map.of(
                    "status", "error",
                    "message", e.getMessage() != null ? e.getMessage() : "Đồng bộ bài hát thất bại"
            ));
        }
    }

    /**
     * API lấy danh sách toàn bộ các bài hát đã đồng bộ công khai cho tất cả người dùng
     */
    @GetMapping({"/trending", "/admin-library", "/tracks", "/synced-tracks"})
    public ResponseEntity<?> getTrendingTracks() {
        return ResponseEntity.ok(soundCloudScraperService.getAdminTracks());
    }

    /**
     * API lấy danh sách URL bài hát đã đồng bộ (giúp Extension kiểm tra để không cào lại)
     */
    @GetMapping("/synced-urls")
    public ResponseEntity<?> getSyncedUrls() {
        return ResponseEntity.ok(soundCloudScraperService.getSyncedUrls());
    }

    /**
     * API kích hoạt tự động quét và nạp thêm các bài hát thịnh hành mới từ SoundCloud
     */
    @PostMapping("/trending/refresh")
    public ResponseEntity<?> refreshTrendingTracks(@RequestParam(value = "count", defaultValue = "3") int count) {
        log.info("Yêu cầu quét tự động thêm bài hát thịnh hành từ SoundCloud (count={})", count);
        var newlyAdded = soundCloudScraperService.syncTrendingTracks(count);
        return ResponseEntity.ok(Map.of(
                "status", "success",
                "message", "Đã cập nhật thêm " + newlyAdded.size() + " bài hát thịnh hành từ SoundCloud!",
                "newTracks", newlyAdded,
                "totalTracks", soundCloudScraperService.getAdminTracks().size(),
                "tracks", soundCloudScraperService.getAdminTracks()
        ));
    }

    /**
     * API xóa vĩnh viễn bài hát khỏi kho nhạc Admin & Supabase Storage
     */
    @DeleteMapping("/admin/track")
    public ResponseEntity<?> deleteAdminTrack(@RequestParam("url") String url) {
        log.info("Yêu cầu xóa bài hát khỏi kho Admin: {}", url);
        boolean removed = soundCloudScraperService.removeTrack(url);
        return ResponseEntity.ok(Map.of("success", removed, "url", url));
    }

    /**
     * API lấy danh sách toàn bộ người dùng đăng ký từ Supabase Auth (dành riêng cho Admin)
     */
    @GetMapping(value = "/admin/users", produces = "application/json")
    public ResponseEntity<String> getAdminUsers() {
        try {
            return ResponseEntity.ok(supabaseStorageService.getUsersList());
        } catch (Exception e) {
            log.error("Lỗi khi lấy danh sách users: {}", e.getMessage());
            return ResponseEntity.internalServerError().body("{\"error\":\"" + e.getMessage() + "\"}");
        }
    }

    /**
     * API kiểm tra tình trạng Backend
     */
    @GetMapping("/health")
    public ResponseEntity<?> healthCheck() {
        return ResponseEntity.ok(Map.of(
                "status", "UP",
                "service", "Music Backend (Spring Boot 3 + Supabase + SoundCloud Streamer)"
        ));
    }
}
