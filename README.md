# NhacOffline - Ứng Dụng Nghe Nhạc Online & Offline (PWA)

Mô hình kiến trúc: **Spring Boot 3 (Java 17+) + React JS (Vite) + Supabase Storage + PWA Service Worker**.

---

## 1. Cấu Trúc Dự Án

```text
NhacOffline/
├── backend/
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/nhacoffline/
│       │   ├── MusicBackendApplication.java
│       │   ├── config/CorsConfig.java
│       │   ├── controller/MusicController.java
│       │   ├── dto/
│       │   │   ├── MusicTrackResponse.java
│       │   │   └── SyncSoundCloudRequest.java
│       │   └── service/
│       │       ├── SoundCloudScraperService.java
│       │       └── SupabaseStorageService.java
│       └── resources/application.yml
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── public/
    │   ├── manifest.json
    │   └── sw.js          <-- Service Worker xử lý Offline Cache API
    └── src/
        ├── App.jsx
        ├── index.css      <-- Spotify Dark Theme
        ├── main.jsx
        ├── components/
        │   ├── AudioPlayer.jsx
        │   ├── Playlist.jsx
        │   └── SoundCloudForm.jsx
        └── utils/
            └── cacheHelper.js
```

---

## 2. Yêu Cầu Cài Đặt Môi Trường

1. **Java JDK 17+** và **Maven**.
2. **Node.js (18+)** và **npm**.
3. **yt-dlp**: Công cụ cào nhạc âm thanh chất lượng cao:
   - Windows: `winget install yt-dlp` hoặc tải file `yt-dlp.exe` đặt vào biến môi trường PATH.
   - macOS: `brew install yt-dlp`
   - Linux: `sudo apt install yt-dlp` hoặc `pip install yt-dlp`
   - *Kiểm tra*: Chạy lệnh `yt-dlp --version` trong terminal.

---

## 3. Hướng Dẫn Thiết Lập Supabase

1. Truy cập [https://supabase.com](https://supabase.com) và tạo một Project mới.
2. Lấy **Project URL** và **API Key**:
   - Vào **Project Settings** -> **API**.
   - Copy **Project URL** (dạng `https://xxxx.supabase.co`).
   - Copy **service_role key** (Secret) để đưa vào file cấu hình Backend (đảm bảo quyền ghi vào Storage mà không lo vướng RLS).
3. Tạo Storage Bucket:
   - Vào menu **Storage** -> Chọn **New bucket**.
   - Đặt tên bucket: `music`.
   - **BẬT CÔNG TẮC**: `Public bucket` -> Chọn **Save**.
4. Cấu hình CORS Storage trên Supabase (nếu cần):
   - Mặc định Supabase Storage hỗ trợ GET từ mọi origin (`*`), giúp trình duyệt tải và cache nhạc trực tiếp.

---

## 4. Khởi Chạy Ứng Dụng

### Khởi chạy Backend (Spring Boot):
1. Mở file `backend/src/main/resources/application.yml`.
2. Thay thế `url` và `key` bằng thông tin Supabase của bạn (hoặc thiết lập biến môi trường `SUPABASE_URL` và `SUPABASE_KEY`).
3. Chạy lệnh:
   ```bash
   cd backend
   mvn spring-boot:run
   ```
   Backend sẽ lắng nghe tại `http://localhost:8080`.

### Khởi chạy Frontend (React Vite):
1. Chạy lệnh cài đặt và khởi động:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
2. Mở trình duyệt tại: `http://localhost:5173`.
3. Dán link bài hát SoundCloud vào ô input và bấm **"Đồng bộ"**.
4. Bấm nghe bài hát. Sau đó thử bật chế độ **Offline** trên DevTools (Tab Network -> Chọn Offline), bạn sẽ thấy bài hát vẫn phát bình thường và giao diện web vẫn tải được nhờ Service Worker!
