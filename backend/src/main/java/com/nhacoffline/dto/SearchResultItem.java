package com.nhacoffline.dto;

public class SearchResultItem {
    private String id;
    private String title;
    private String artist;
    private Long durationSeconds;
    private String thumbnail;
    private String url;
    private String formattedSize;
    private Long estimatedSizeBytes;

    public SearchResultItem() {
    }

    public SearchResultItem(String id, String title, String artist, Long durationSeconds, String thumbnail, String url) {
        this.id = id;
        this.title = title;
        this.artist = artist;
        this.durationSeconds = durationSeconds;
        this.thumbnail = thumbnail;
        this.url = url;
        
        // Tính toán dung lượng ước tính khi tải về (128 kbps MP3 = 16 KB/s)
        if (durationSeconds != null && durationSeconds > 0) {
            long bytes = durationSeconds * 16000L;
            this.estimatedSizeBytes = bytes;
            if (bytes > 48L * 1024 * 1024) {
                this.formattedSize = "~43 MB (Nén)";
            } else {
                double mb = (double) bytes / (1024 * 1024);
                this.formattedSize = String.format(java.util.Locale.US, "~%.1f MB", mb);
            }
        } else {
            this.formattedSize = "-- MB";
            this.estimatedSizeBytes = 0L;
        }
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getArtist() { return artist; }
    public void setArtist(String artist) { this.artist = artist; }

    public Long getDurationSeconds() { return durationSeconds; }
    public void setDurationSeconds(Long durationSeconds) { this.durationSeconds = durationSeconds; }

    public String getThumbnail() { return thumbnail; }
    public void setThumbnail(String thumbnail) { this.thumbnail = thumbnail; }

    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }

    public String getFormattedSize() { return formattedSize; }
    public void setFormattedSize(String formattedSize) { this.formattedSize = formattedSize; }

    public Long getEstimatedSizeBytes() { return estimatedSizeBytes; }
    public void setEstimatedSizeBytes(Long estimatedSizeBytes) { this.estimatedSizeBytes = estimatedSizeBytes; }
}
