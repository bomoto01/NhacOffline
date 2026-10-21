package com.nhacoffline.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * Controller xử lý Đăng nhập / Đăng ký tài khoản qua Supabase Auth an toàn từ Server
 * Giúp Frontend không cần chứa Secret Key, tránh hoàn toàn lỗi "Forbidden use of secret API key in browser"
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    private final String supabaseUrl;
    private final String supabaseKey;
    private final RestClient restClient;

    public AuthController(
            @Value("${supabase.url}") String supabaseUrl,
            @Value("${supabase.key}") String supabaseKey) {
        this.supabaseUrl = supabaseUrl.replaceAll("/+$", "");
        this.supabaseKey = supabaseKey;
        this.restClient = RestClient.builder().build();
    }

    /**
     * API Đăng nhập tài khoản bằng Email & Mật khẩu
     */
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        String password = body.get("password");

        if (email == null || email.isBlank() || password == null || password.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Email và mật khẩu không được để trống"));
        }

        log.info("Xử lý đăng nhập cho email: {}", email);
        try {
            String tokenUrl = String.format("%s/auth/v1/token?grant_type=password", supabaseUrl);
            String responseJson = restClient.post()
                    .uri(tokenUrl)
                    .header("apikey", supabaseKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("email", email.trim(), "password", password))
                    .retrieve()
                    .body(String.class);

            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(responseJson);
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            log.warn("Đăng nhập thất bại cho {}: {}", email, e.getResponseBodyAsString());
            return ResponseEntity.status(e.getStatusCode())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(e.getResponseBodyAsString());
        } catch (Exception e) {
            log.error("Lỗi hệ thống khi đăng nhập: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().body(Map.of("message", "Lỗi máy chủ khi đăng nhập: " + e.getMessage()));
        }
    }

    /**
     * API Đăng ký tài khoản mới bằng Email & Mật khẩu
     * Sử dụng endpoint Supabase Admin (/auth/v1/admin/users) với Service Role Key để:
     * 1. Tự động xác thực email (email_confirm: true), loại bỏ hoàn toàn lỗi "email rate limit exceeded"
     * 2. Tự động cấp access_token để người dùng được đăng nhập ngay mà không cần đợi email kích hoạt.
     */
    @PostMapping("/signup")
    public ResponseEntity<?> signup(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        String password = body.get("password");

        if (email == null || email.isBlank() || password == null || password.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Email và mật khẩu không được để trống"));
        }

        if (password.trim().length() < 6) {
            return ResponseEntity.badRequest().body(Map.of("message", "Mật khẩu phải có ít nhất 6 ký tự"));
        }

        log.info("Xử lý tạo tài khoản thành viên mới cho email: {}", email);
        try {
            // 1. Tạo user trực tiếp qua Admin API với email_confirm: true
            String adminUserUrl = String.format("%s/auth/v1/admin/users", supabaseUrl);
            Map<String, Object> createUserPayload = Map.of(
                    "email", email.trim(),
                    "password", password,
                    "email_confirm", true,
                    "user_metadata", Map.of(
                            "role", "member",
                            "name", email.contains("@") ? email.split("@")[0] : email
                    )
            );

            restClient.post()
                    .uri(adminUserUrl)
                    .header("apikey", supabaseKey)
                    .header("Authorization", "Bearer " + supabaseKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(createUserPayload)
                    .retrieve()
                    .body(String.class);

            // 2. Tự động lấy token đăng nhập ngay lập tức cho user mới tạo
            String tokenUrl = String.format("%s/auth/v1/token?grant_type=password", supabaseUrl);
            String tokenResponse = restClient.post()
                    .uri(tokenUrl)
                    .header("apikey", supabaseKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("email", email.trim(), "password", password))
                    .retrieve()
                    .body(String.class);

            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(tokenResponse);
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            log.warn("Đăng ký thất bại cho {}: {}", email, e.getResponseBodyAsString());
            return ResponseEntity.status(e.getStatusCode())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(e.getResponseBodyAsString());
        } catch (Exception e) {
            log.error("Lỗi hệ thống khi đăng ký: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().body(Map.of("message", "Lỗi máy chủ khi đăng ký: " + e.getMessage()));
        }
    }
}
