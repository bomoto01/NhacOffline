package com.nhacoffline.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;

/**
 * Service quản lý tương tác với Supabase Storage thông qua REST API chính thức.
 * Không cần thư viện ngoài, tối ưu và tương thích 100% với Spring Boot 3.
 */
@Service
public class SupabaseStorageService {

    private static final Logger log = LoggerFactory.getLogger(SupabaseStorageService.class);

    private final String supabaseUrl;
    private final String supabaseKey;
    private final String bucketName;
    private final RestClient restClient;

    public SupabaseStorageService(
            @Value("${supabase.url}") String supabaseUrl,
            @Value("${supabase.key}") String supabaseKey,
            @Value("${supabase.bucket:music}") String bucketName) {
        this.supabaseUrl = supabaseUrl.replaceAll("/+$", ""); // Bỏ dấu / ở cuối nếu có
        this.supabaseKey = supabaseKey;
        this.bucketName = bucketName;
        this.restClient = RestClient.builder().build();
    }

    /**
     * Upload mảng byte của file MP3 trực tiếp lên Supabase Storage bucket.
     * Sử dụng Header 'x-upsert: true' để tự động ghi đè nếu file đã tồn tại.
     *
     * @param fileName Tên file (ví dụ: track_123.mp3)
     * @param fileData Mảng byte file mp3 (được stream trực tiếp từ bộ nhớ RAM)
     * @param mimeType Định dạng file (audio/mpeg)
     * @return URL công khai (Public URL) truy cập file trên Supabase
     */
    public String uploadFile(String fileName, byte[] fileData, String mimeType) {
        try {
            // Chuẩn hóa tên file an toàn cho đường dẫn URL Supabase
            String cleanFileName = sanitizeFileName(fileName);
            String uploadUrl = String.format("%s/storage/v1/object/%s/%s", supabaseUrl, bucketName, cleanFileName);

            log.info("Bắt đầu upload bài hát lên Supabase Storage: {} (Kích thước: {} bytes)", cleanFileName, fileData.length);

            // Gửi HTTP POST trực tiếp đến Supabase Storage REST API
            String responseBody = restClient.post()
                    .uri(uploadUrl)
                    .header("Authorization", "Bearer " + supabaseKey)
                    .header("apikey", supabaseKey)
                    .header("x-upsert", "true") // Cho phép ghi đè nếu file đã tồn tại
                    .contentType(MediaType.parseMediaType(mimeType != null ? mimeType : "audio/mpeg"))
                    .body(fileData)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, (request, response) -> {
                        String errorMsg = new String(response.getBody().readAllBytes(), StandardCharsets.UTF_8);
                        log.error("Lỗi khi upload lên Supabase Storage: Status {}, Message: {}", response.getStatusCode(), errorMsg);
                        throw new RuntimeException("Lỗi Supabase Storage API: " + errorMsg);
                    })
                    .body(String.class);

            log.info("Upload bài hát lên Supabase thành công. Phản hồi: {}", responseBody);

            // Trả về Public URL cho Frontend phát nhạc và lưu Cache API
            return getPublicUrl(cleanFileName);
        } catch (Exception e) {
            log.error("Thất bại khi upload file lên Supabase Storage: {}", e.getMessage(), e);
            throw new RuntimeException("Không thể upload bài hát lên Supabase Storage: " + e.getMessage(), e);
        }
    }

    /**
     * Tạo Public URL để truy cập trực tiếp file âm thanh từ Supabase công khai
     */
    public String getPublicUrl(String fileName) {
        String cleanFileName = sanitizeFileName(fileName);
        return String.format("%s/storage/v1/object/public/%s/%s", supabaseUrl, bucketName, cleanFileName);
    }

    /**
     * Làm sạch ký tự lạ trong tên file để tránh lỗi URL encode
     */
    private String sanitizeFileName(String fileName) {
        if (fileName == null || fileName.isBlank()) {
            return "track_" + System.currentTimeMillis() + ".mp3";
        }
        return fileName.replaceAll("[^a-zA-Z0-9._-]", "_");
    }

    /**
     * Lấy danh sách toàn bộ người dùng đăng ký từ Supabase Auth Admin API
     */
    public String getUsersList() {
        try {
            String usersUrl = String.format("%s/auth/v1/admin/users", supabaseUrl);
            return restClient.get()
                    .uri(usersUrl)
                    .header("Authorization", "Bearer " + supabaseKey)
                    .header("apikey", supabaseKey)
                    .retrieve()
                    .body(String.class);
        } catch (Exception e) {
            log.error("Lỗi khi lấy danh sách users từ Supabase Auth: {}", e.getMessage(), e);
            throw new RuntimeException("Không thể lấy danh sách users: " + e.getMessage(), e);
        }
    }

    /**
     * Xóa một file khỏi Supabase Storage
     */
    public boolean deleteFile(String fileName) {
        if (fileName == null || fileName.isBlank()) return false;
        try {
            String cleanName = sanitizeFileName(fileName);
            String deleteUrl = String.format("%s/storage/v1/object/%s/%s", supabaseUrl, bucketName, cleanName);
            restClient.delete()
                    .uri(deleteUrl)
                    .header("Authorization", "Bearer " + supabaseKey)
                    .header("apikey", supabaseKey)
                    .retrieve()
                    .toBodilessEntity();
            log.info("Đã xóa file khỏi Supabase Storage: {}", cleanName);
            return true;
        } catch (Exception e) {
            log.warn("Không thể xóa file '{}' từ Supabase Storage: {}", fileName, e.getMessage());
            return false;
        }
    }
}
