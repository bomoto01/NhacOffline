# ========================================================
# Stage 1: Build JAR bằng Maven
# ========================================================
FROM maven:3.9.6-eclipse-temurin-17 AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn clean package -DskipTests

# ========================================================
# Stage 2: Runtime image với Java 17 + ffmpeg + yt-dlp
# ========================================================
FROM eclipse-temurin:17-jre-jammy
WORKDIR /app

# Cài đặt ffmpeg, python3, curl và các thư viện cần thiết
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    curl \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Tải yt-dlp binary mới nhất cho Linux
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Copy JAR từ builder
COPY --from=builder /app/target/music-backend-1.0.0.jar app.jar

# Tạo thư mục data để lưu cache
RUN mkdir -p /app/data
COPY data /app/data

# Mặc định cổng 8080 (hoặc biến môi trường PORT từ Render/Railway)
ENV PORT=8080
ENV YTDLP_PATH=/usr/local/bin/yt-dlp

EXPOSE 8080

CMD ["sh", "-c", "java -Dserver.port=${PORT:-8080} -jar app.jar"]
