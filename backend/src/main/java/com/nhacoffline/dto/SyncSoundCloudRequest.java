package com.nhacoffline.dto;

import jakarta.validation.constraints.NotBlank;

public class SyncSoundCloudRequest {

    @NotBlank(message = "Link bài hát SoundCloud không được để trống")
    private String url;

    public SyncSoundCloudRequest() {
    }

    public SyncSoundCloudRequest(String url) {
        this.url = url;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }
}
