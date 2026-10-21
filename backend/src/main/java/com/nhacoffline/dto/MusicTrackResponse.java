package com.nhacoffline.dto;

public class MusicTrackResponse {
    private String id;
    private String title;
    private String artist;
    private String supabaseUrl;
    private Long durationSeconds;
    private String coverUrl;
    private String originalUrl;
    private String createdAt;
    private String formattedSize;

    public MusicTrackResponse() {
    }

    public MusicTrackResponse(String id, String title, String artist, String supabaseUrl, Long durationSeconds, String coverUrl, String originalUrl, String createdAt, String formattedSize) {
        this.id = id;
        this.title = title;
        this.artist = artist;
        this.supabaseUrl = supabaseUrl;
        this.durationSeconds = durationSeconds;
        this.coverUrl = coverUrl;
        this.originalUrl = originalUrl;
        this.createdAt = createdAt;
        this.formattedSize = formattedSize;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private String id;
        private String title;
        private String artist;
        private String supabaseUrl;
        private Long durationSeconds;
        private String coverUrl;
        private String originalUrl;
        private String createdAt;
        private String formattedSize;

        public Builder id(String id) { this.id = id; return this; }
        public Builder title(String title) { this.title = title; return this; }
        public Builder artist(String artist) { this.artist = artist; return this; }
        public Builder supabaseUrl(String supabaseUrl) { this.supabaseUrl = supabaseUrl; return this; }
        public Builder durationSeconds(Long durationSeconds) { this.durationSeconds = durationSeconds; return this; }
        public Builder coverUrl(String coverUrl) { this.coverUrl = coverUrl; return this; }
        public Builder originalUrl(String originalUrl) { this.originalUrl = originalUrl; return this; }
        public Builder createdAt(String createdAt) { this.createdAt = createdAt; return this; }
        public Builder formattedSize(String formattedSize) { this.formattedSize = formattedSize; return this; }

        public MusicTrackResponse build() {
            if (this.formattedSize == null && durationSeconds != null && durationSeconds > 0) {
                long bytes = durationSeconds * 16000L;
                if (bytes > 48L * 1024 * 1024) {
                    this.formattedSize = "~43 MB (Nén)";
                } else {
                    double mb = (double) bytes / (1024 * 1024);
                    this.formattedSize = String.format(java.util.Locale.US, "~%.1f MB", mb);
                }
            }
            return new MusicTrackResponse(id, title, artist, supabaseUrl, durationSeconds, coverUrl, originalUrl, createdAt, formattedSize);
        }
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getArtist() { return artist; }
    public void setArtist(String artist) { this.artist = artist; }

    public String getSupabaseUrl() { return supabaseUrl; }
    public void setSupabaseUrl(String supabaseUrl) { this.supabaseUrl = supabaseUrl; }

    public Long getDurationSeconds() { return durationSeconds; }
    public void setDurationSeconds(Long durationSeconds) { this.durationSeconds = durationSeconds; }

    public String getCoverUrl() { return coverUrl; }
    public void setCoverUrl(String coverUrl) { this.coverUrl = coverUrl; }

    public String getOriginalUrl() { return originalUrl; }
    public void setOriginalUrl(String originalUrl) { this.originalUrl = originalUrl; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }

    public String getFormattedSize() { return formattedSize; }
    public void setFormattedSize(String formattedSize) { this.formattedSize = formattedSize; }
}
