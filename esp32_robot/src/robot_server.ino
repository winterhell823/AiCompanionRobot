// ESP32 companion robot: motor web server + TFT display
//   Idle  : cycles clock + weather, a random retro emoji face, and obstacle distance
//   Active: animated emoji faces, chosen by the laptop (/face?s=happy&talk=1)
// Libraries to install: "Adafruit GFX Library" and "Adafruit ST7735 and ST7789 Library"
#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <time.h>
#include <sys/time.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include <TJpg_Decoder.h>
#include "driver/i2s.h"
#include "driver/adc.h"

// Keep local Wi-Fi credentials in robot_secrets.h (copy robot_secrets.example.h).
#if __has_include("robot_secrets.h")
#include "robot_secrets.h"
#else
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
#endif
const float LAT = 28.4595;                    // Gurugram, change for your city
const float LON = 77.0266;
const long  GMT_OFFSET_SEC = 19800;           // IST = UTC+5:30
const unsigned long IDLE_AFTER_MS = 20000;    // non-listening face -> idle after inactivity
const unsigned long LISTENING_FACE_MS = 5000;
const unsigned long INFO_MS  = 10000;         // idle: clock + weather screen stays this long
const unsigned long EMOJI_MS = 5000;          // idle: then a random emoji face stays this long
const unsigned long WEATHER_REFRESH_MS = 900000;
const unsigned long WEATHER_RETRY_MS = 300000;
const char* CAMERA_IP = "192.168.1.10";
const uint16_t CAMERA_PORT = 80;
const char* CAMERA_PATH = "/capture";
const unsigned long PHOTO_MS = 5000;
const unsigned long PREVIEW_MS = 10000;
const unsigned long AUTO_PREVIEW_INTERVAL_MS = 10000;
const unsigned long AUTO_PREVIEW_DURATION_MS = 5000;
const unsigned long PREVIEW_FRAME_INTERVAL_MS = 200;
const unsigned long CAMERA_CHECK_INTERVAL_MS = 10000;
const size_t CAMERA_BUFFER_SIZE = 40000;
const int SENSOR_MAX_CM = 200;
const unsigned long SENSOR_REFRESH_MS = 5000;
const unsigned long SENSOR_PAGE_MS = 10000;
// ==============================================

// TFT (from your chart). SCK = D18 and MOSI = D23 are the hardware SPI pins.
#define TFT_CS  5
#define TFT_DC  2
#define TFT_RST 15

// Motor shield
#define SR_SER   13
#define SR_CLK   14
#define SR_LATCH 27
#define SR_OE    26   // active LOW
const int PWM_PINS[4] = {25, 33, 32, 4};
const int A_BIT[4]    = {2, 1, 5, 0};
const int B_BIT[4]    = {3, 4, 7, 6};

// Obstacle sensor (HC-SR04). ECHO outputs 5V -> use a 1k + 2k divider before the ESP32 pin.
#define TRIG_PIN 19
#define ECHO_PIN 21
const int STOP_CM = 20;                            // closer than this = obstacle
const bool STOP_FOR_OBSTACLE_ON_VOICE = true;      // also stop voice "forward" when something is in the way
const unsigned long WANDER_EVERY_MS = 5000;        // idle: one wander move every 5 s
const unsigned long WANDER_STEP_MS  = 600;         // idle: how long to creep forward (then reverse the same amount)

enum WState { W_WAIT, W_OUT, W_BACK, W_TURN };
WState ws = W_WAIT;
unsigned long wsStart = 0, wsDur = 0, nextWander = 0, lastDist = 0, lastVoiceDist = 0;
int turnDir = 1;
bool movingForward = false;

Adafruit_ST7735 tft(TFT_CS, TFT_DC, TFT_RST);
GFXcanvas16 cv(160, 128);          // draw off-screen, then push once = no flicker
WebServer server(80);

#define C565(r, g, b) ((((r) & 0xF8) << 8) | (((g) & 0xFC) << 3) | (((b) & 0xF8) >> 3))
const uint16_t YEL = C565(255, 205, 40), DARK = C565(45, 28, 10), WHT = 0xFFFF;
const uint16_t RED = C565(235, 40, 60), PINK = C565(255, 110, 140), BLK = 0x0000;

// ---------- state ----------
enum Mode { MODE_IDLE, MODE_FACE, CAMERA_PREVIEW, DISPLAYING_PHOTO };
Mode mode = MODE_IDLE;
String face = "happy";
bool talking = false;
unsigned long lastInteract = 0;

uint32_t wallSeed = 1;
int wallType = 0;
unsigned long wallChanged = 0;
uint8_t idlePage = 0;             // 0 = clock/weather, 1 = emoji face, 2 = obstacle monitor
int emojiType = 0;
unsigned long pageChanged = 0;
unsigned long startupDashboardUntil = 0;
int lastSec = -2;
unsigned long lastSensorDraw = 0;

float tempC = 0;
int wCode = -1;
bool weatherOk = false;
unsigned long nextWeather = 0;

unsigned long stopAt = 0;
bool moving = false;
uint8_t* cameraFrame = nullptr;
size_t cameraFrameLength = 0;
bool photoRequested = false;
bool cameraAvailable = false;
bool cameraModeRandom = false;
bool cameraHasRenderedFrame = false;
uint8_t cameraFailStreak = 0;
unsigned long cameraModeUntil = 0;
unsigned long cameraDurationMs = 0;
unsigned long nextPreviewAt = 0;
unsigned long nextCameraFrameAt = 0;
unsigned long nextCameraCheckAt = 0;
Mode previousMode = MODE_IDLE;
uint8_t previousIdlePage = 0;
String previousFace = "happy";
bool previousTalking = false;
unsigned long previousInteract = 0;
bool faceSensorHudVisible = false;
volatile bool muteMicRequested = false;
portMUX_TYPE sensorMux = portMUX_INITIALIZER_UNLOCKED;
int obstacleDistanceCm = 999;
bool obstacleSensorUnavailable = false;
bool obstacleNoEcho = true;
unsigned long obstacleUpdatedAt = 0;

#define I2S_PORT I2S_NUM_0
#define I2S_DOUT 22
#define MIC_AO 34
#define MIC_DO 35
const int AUDIO_RATE = 16000;
const int AUDIO_FRAMES = 256;
const float MIC_PCM_GAIN = 0.5f;
const int SPEAKER_VOLUME_PERCENT = 15;
const int SPEAKER_PREFILL = 1500;
const int SPEAKER_RING_SIZE = 4096;
WiFiServer audioServer(5005);
WiFiClient audioClient;
int16_t speakerRing[SPEAKER_RING_SIZE];
int speakerHead = 0, speakerTail = 0, speakerCount = 0;

bool jpgOutput(int16_t x, int16_t y, uint16_t w, uint16_t h, uint16_t* bitmap) {
  if (y >= tft.height()) return false;
  tft.drawRGBBitmap(x, y, bitmap, w, h);
  return true;
}

void setupSpeakerI2s() {
  i2s_config_t config = {};
  config.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX);
  config.sample_rate = AUDIO_RATE;
  config.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;
  config.channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT;
  config.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  config.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  config.dma_buf_count = 6;
  config.dma_buf_len = AUDIO_FRAMES;
  config.use_apll = false;
  config.tx_desc_auto_clear = false;

  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = I2S_PIN_NO_CHANGE;
  pins.ws_io_num = I2S_PIN_NO_CHANGE;
  pins.data_out_num = I2S_DOUT;
  pins.data_in_num = I2S_PIN_NO_CHANGE;
  i2s_driver_install(I2S_PORT, &config, 0, NULL);
  i2s_set_pin(I2S_PORT, &pins);
}

void audioTask(void*) {
  int32_t output[AUDIO_FRAMES * 2];
  int16_t microphone[AUDIO_FRAMES];
  uint8_t network[1024];
  float dc = 2048.0f;
  uint32_t sigmaAccumulator = 0;
  unsigned long muteUntil = 0;
  unsigned long lastPlaybackMs = 0;
  unsigned long lastSpeakerDataMs = 0;
  bool hasPendingSpeakerByte = false;
  uint8_t pendingSpeakerByte = 0;
  bool playing = false;
  float gate = 0.0f;

  for (int i = 0; i < 200; i++) {
    dc = dc * 0.995f + adc1_get_raw(ADC1_CHANNEL_6) * 0.005f;
    delay(1);
  }

  for (;;) {
    WiFiClient candidate = audioServer.available();
    if (candidate) {
      if (audioClient) audioClient.stop();
      audioClient = candidate;
      audioClient.setNoDelay(true);
      speakerHead = speakerTail = speakerCount = 0;
      hasPendingSpeakerByte = false;
      playing = false;
    }

    int avail = audioClient ? audioClient.available() : 0;
    while (avail > 0 && speakerCount < SPEAKER_RING_SIZE - 1) {
      int n = min(min(avail, (int)sizeof(network)), SPEAKER_RING_SIZE - speakerCount - 1);
      n = audioClient.read(network, n);
      if (n <= 0) break;
      lastSpeakerDataMs = millis();
      for (int i = 0; i < n; i++) {
        if (hasPendingSpeakerByte) {
          int16_t sample = (int16_t)(pendingSpeakerByte | (network[i] << 8));
          speakerRing[speakerHead] = sample;
          speakerHead = (speakerHead + 1) % SPEAKER_RING_SIZE;
          speakerCount++;
          hasPendingSpeakerByte = false;
        } else {
          pendingSpeakerByte = network[i];
          hasPendingSpeakerByte = true;
        }
      }
      avail = audioClient.available();
    }

    unsigned long started = micros();
    for (int i = 0; i < AUDIO_FRAMES; i++) {
      while (micros() - started < (i * 625UL) / 10) taskYIELD();
      int raw = adc1_get_raw(ADC1_CHANNEL_6);
      dc += 0.002f * (raw - dc);
      float gained = (raw - dc) * 2.0f * 16.0f * MIC_PCM_GAIN;
      microphone[i] = (int16_t)constrain(gained, -32768, 32767);
    }

    if (!playing && speakerCount > 0 &&
        (speakerCount >= SPEAKER_PREFILL || millis() - lastSpeakerDataMs > 150)) {
      playing = true;
    }
    if (playing && speakerCount == 0) {
      playing = false;
      muteUntil = millis() + 400;
    }
    if (playing) lastPlaybackMs = millis();
    float gateTarget = (playing || speakerCount > 0 || millis() - lastPlaybackMs < 300) ? 1.0f : 0.0f;
    for (int i = 0; i < AUDIO_FRAMES; i++) {
      int16_t sample = 0;
      if (playing && speakerCount > 0) {
        sample = speakerRing[speakerTail];
        speakerTail = (speakerTail + 1) % SPEAKER_RING_SIZE;
        speakerCount--;
      }
      sample = (int16_t)(((int32_t)sample * SPEAKER_VOLUME_PERCENT) / 100);
      if (gate < gateTarget) {
        gate += 1.0f / 1600;
        if (gate > 1.0f) gate = 1.0f;
      } else if (gate > gateTarget) {
        gate -= 1.0f / 3200;
        if (gate < 0.0f) gate = 0.0f;
      }
      uint32_t level = (uint32_t)(((int32_t)sample + 32768) * gate);
      uint32_t words[2] = {0, 0};
      for (int channel = 0; channel < 2; channel++) {
        for (int bit = 31; bit >= 0; bit--) {
          sigmaAccumulator += level;
          if (sigmaAccumulator >= 65536) {
            sigmaAccumulator -= 65536;
            words[channel] |= (1u << bit);
          }
        }
      }
      output[2 * i] = words[0];
      output[2 * i + 1] = words[1];
    }
    size_t written = 0;
    i2s_write(I2S_PORT, output, AUDIO_FRAMES * 8, &written, 100 / portTICK_PERIOD_MS);

    if (audioClient && audioClient.connected() && !playing && !muteMicRequested && millis() > muteUntil) {
      audioClient.write((uint8_t*)microphone, AUDIO_FRAMES * 2);
    }
  }
}

// ================= helpers =================
uint16_t hsv(float h, float s, float v) {          // h 0-360
  h = fmod(h, 360.0);
  if (h < 0) h += 360;
  float c = v * s, x = c * (1 - fabs(fmod(h / 60.0, 2) - 1)), m = v - c, r, g, b;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return C565((int)((r + m) * 255), (int)((g + m) * 255), (int)((b + m) * 255));
}

void push() { tft.drawRGBBitmap(0, 0, cv.getBuffer(), 160, 128); }

void arc(int cx, int cy, int r, int a0, int a1, int th, uint16_t c) {
  for (int a = a0; a <= a1; a += 4)
    cv.fillCircle(cx + cos(a * DEG_TO_RAD) * r, cy + sin(a * DEG_TO_RAD) * r, th, c);
}

void thickLine(int x0, int y0, int x1, int y1, uint16_t c) {
  for (int o = -1; o <= 1; o++) cv.drawLine(x0, y0 + o, x1, y1 + o, c);
}

void heart(int x, int y, int s, uint16_t c) {
  cv.fillCircle(x - s / 2, y - s / 3, s / 2 + 1, c);
  cv.fillCircle(x + s / 2, y - s / 3, s / 2 + 1, c);
  cv.fillTriangle(x - s - 1, y - s / 6, x + s + 1, y - s / 6, x, y + s, c);
}

void splash(const char* l1, const char* l2) {
  cv.fillScreen(C565(10, 10, 30));
  cv.setTextColor(WHT);
  cv.setTextSize(2);
  cv.setCursor(10, 40); cv.print(l1);
  cv.setTextSize(1);
  cv.setCursor(10, 70); cv.print(l2);
  push();
}

// ================= wallpapers =================
void gradient(float h1, float h2, float s, float v1, float v2) {
  for (int y = 0; y < 128; y++) {
    float t = y / 127.0;
    cv.drawFastHLine(0, y, 160, hsv(h1 + (h2 - h1) * t, s, v1 + (v2 - v1) * t));
  }
}

void wallpaper() {                 // same seed = same picture, so it can be redrawn every second
  randomSeed(wallSeed);
  float h1 = random(360), h2 = h1 + 50 + random(110);
  switch (wallType) {
    case 0:                        // colour gradient
      gradient(h1, h2, 0.85, 1.0, 0.9);
      break;
    case 1:                        // bubbles
      gradient(h1, h2, 0.7, 0.55, 0.9);
      for (int i = 0; i < 14; i++) {
        int r = 5 + random(20), x = random(160), y = random(128);
        uint16_t c = hsv(random(360), 0.35, 1.0);
        cv.drawCircle(x, y, r, c);
        cv.drawCircle(x, y, r - 1, c);
      }
      break;
    case 2: {                      // rainbow rings
      int cx = 40 + random(80), cy = 30 + random(70);
      for (int r = 140; r > 0; r -= 9) cv.fillCircle(cx, cy, r, hsv(h1 + r * 2.5, 0.85, 1.0));
      break;
    }
    case 3:                        // night sky
      gradient(235, 270, 0.8, 0.28, 0.06);
      for (int i = 0; i < 45; i++) {
        int x = random(160), y = random(128);
        cv.drawPixel(x, y, WHT);
        if (random(5) == 0) { cv.drawFastHLine(x - 2, y, 5, WHT); cv.drawFastVLine(x, y - 2, 5, WHT); }
      }
      cv.fillCircle(130, 22, 11, C565(250, 245, 200));
      cv.fillCircle(135, 19, 10, hsv(240, 0.8, 0.2));
      break;
    default: {                     // sunset
      gradient(270, 395, 0.85, 0.9, 1.0);
      cv.fillCircle(40 + random(80), 100, 22, C565(255, 235, 120));
      cv.fillRect(0, 104, 160, 24, C565(30, 20, 70));
      break;
    }
  }
}

void newWallpaper() {
  wallSeed = esp_random();
  wallType = esp_random() % 5;
  wallChanged = millis();
  lastSec = -2;
}

// ================= weather =================
void cloud(int cx, int cy, uint16_t c) {
  cv.fillCircle(cx - 12, cy + 4, 8, c);
  cv.fillCircle(cx, cy - 4, 11, c);
  cv.fillCircle(cx + 13, cy + 4, 8, c);
  cv.fillRect(cx - 12, cy + 4, 26, 8, c);
}

void sun(int cx, int cy, int r) {
  uint16_t c = C565(255, 210, 40);
  for (int a = 0; a < 360; a += 45)
    cv.drawLine(cx + cos(a * DEG_TO_RAD) * (r + 3), cy + sin(a * DEG_TO_RAD) * (r + 3),
                cx + cos(a * DEG_TO_RAD) * (r + 8), cy + sin(a * DEG_TO_RAD) * (r + 8), c);
  cv.fillCircle(cx, cy, r, c);
}

void weatherIcon(int x, int y, int code) {
  uint16_t CL = C565(235, 240, 250), GR = C565(150, 160, 185), RAIN = C565(90, 170, 255);
  if (code == 0) sun(x, y, 10);
  else if (code <= 2) { sun(x - 8, y - 8, 7); cloud(x + 3, y + 4, CL); }
  else if (code == 3) cloud(x, y, CL);
  else if (code == 45 || code == 48) {
    cloud(x, y - 6, GR);
    for (int i = 0; i < 3; i++) cv.drawFastHLine(x - 18, y + 10 + i * 5, 36, CL);
  } else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    cloud(x, y - 6, GR);
    for (int i = 0; i < 3; i++) cv.drawLine(x - 12 + i * 12, y + 10, x - 15 + i * 12, y + 20, RAIN);
  } else if (code >= 95) {
    cloud(x, y - 6, C565(95, 100, 120));
    cv.fillTriangle(x + 2, y + 6, x - 6, y + 18, x + 2, y + 16, C565(255, 220, 40));
    cv.fillTriangle(x + 2, y + 14, x + 10, y + 14, x - 2, y + 26, C565(255, 220, 40));
  } else if (code >= 71 && code <= 77) {
    cloud(x, y - 6, GR);
    for (int i = 0; i < 3; i++) cv.fillCircle(x - 12 + i * 12, y + 16, 2, WHT);
  } else cloud(x, y, CL);
}

const char* weatherText(int c) {
  if (c == 0) return "Clear sky";
  if (c <= 2) return "Partly cloudy";
  if (c == 3) return "Cloudy";
  if (c == 45 || c == 48) return "Fog / haze";
  if ((c >= 51 && c <= 57)) return "Drizzle";
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return "Rain";
  if (c >= 71 && c <= 77) return "Snow";
  if (c >= 95) return "Thunderstorm";
  return "Weather";
}

void fetchWeather() {
  bool ok = false;
  int responseCode = -1;
  bool freedCameraFrame = false;
  if (cameraFrame && mode != CAMERA_PREVIEW && mode != DISPLAYING_PHOTO) {
    free(cameraFrame);
    cameraFrame = nullptr;
    cameraFrameLength = 0;
    freedCameraFrame = true;
  }

  {
    WiFiClientSecure client;
    client.setInsecure();
    HTTPClient http;
    String url = String("https://api.open-meteo.com/v1/forecast?latitude=") + String(LAT, 4) +
                 "&longitude=" + String(LON, 4) + "&current=temperature_2m,weather_code&timezone=auto";
    if (http.begin(client, url)) {
      http.setConnectTimeout(5000);
      http.setTimeout(5000);
      responseCode = http.GET();
      if (responseCode == 200) {
        String b = http.getString();
        int curPos = b.lastIndexOf("\"current\":");
        int searchFrom = curPos >= 0 ? curPos : 0;
        int i = b.indexOf("\"temperature_2m\":", searchFrom);
        int j = b.indexOf("\"weather_code\":", searchFrom);
        if (i < 0) i = b.lastIndexOf("\"temperature_2m\":");
        if (j < 0) j = b.lastIndexOf("\"weather_code\":");
        if (i > 0 && j > 0) {
          tempC = b.substring(i + 17).toFloat();
          wCode = b.substring(j + 15).toInt();
          ok = true;
        }
        struct tm nowCheck;
        if (!getLocalTime(&nowCheck, 0)) {
          int tIdx = b.indexOf("\"time\":\"", searchFrom);
          if (tIdx > 0) {
            int yr = 0, mo = 0, dy = 0, hr = 0, mn = 0;
            if (sscanf(b.c_str() + tIdx + 8, "%d-%d-%dT%d:%d", &yr, &mo, &dy, &hr, &mn) == 5 && yr >= 2024) {
              struct tm ft = {};
              ft.tm_year = yr - 1900;
              ft.tm_mon = mo - 1;
              ft.tm_mday = dy;
              ft.tm_hour = hr;
              ft.tm_min = mn;
              ft.tm_sec = 0;
              time_t epoch = mktime(&ft);
              if (epoch > 0) {
                struct timeval tv = { epoch, 0 };
                settimeofday(&tv, nullptr);
                Serial.println("[time] seeded clock from weather API");
              }
            }
          }
        }
      }
      http.end();
    }
  }

  if (freedCameraFrame) {
    cameraFrame = (uint8_t*)malloc(CAMERA_BUFFER_SIZE);
    if (!cameraFrame) {
      cameraFrame = (uint8_t*)malloc(20480);
    }
    if (!cameraFrame) {
      Serial.println("[camera] frame buffer reallocation failed after weather");
    }
  }

  if (ok) Serial.println("[weather] current weather updated");
  else Serial.printf("[weather] fetch failed (HTTP %d or invalid response)\n", responseCode);
  weatherOk = weatherOk || ok;
  nextWeather = millis() + (ok ? WEATHER_REFRESH_MS : WEATHER_RETRY_MS);
  lastSec = -2;
  if (mode == MODE_IDLE && idlePage == 0) pageChanged = millis();
}

// ================= idle screen =================
void renderIdle(bool haveTime, struct tm& t) {
  wallpaper();
  uint16_t panel = C565(12, 12, 30);

  // time panel
  cv.fillRoundRect(6, 6, 148, 60, 9, panel);
  cv.drawRoundRect(6, 6, 148, 60, 9, WHT);
  char buf[16];
  if (haveTime) {
    int h = t.tm_hour % 12;
    if (h == 0) h = 12;
    snprintf(buf, sizeof buf, "%d:%02d", h, t.tm_min);
  } else strcpy(buf, "--:--");
  int w = strlen(buf) * 24;
  cv.setTextSize(4);
  cv.setTextColor(WHT);
  cv.setCursor((160 - w) / 2, 12);
  cv.print(buf);

  char d[32];
  if (haveTime) strftime(d, sizeof d, "%a %d %b  %p", &t);
  else strcpy(d, "syncing time...");
  cv.setTextSize(1);
  cv.setTextColor(C565(200, 220, 255));
  cv.setCursor((160 - strlen(d) * 6) / 2, 52);
  cv.print(d);

  // weather panel
  cv.fillRoundRect(6, 72, 148, 50, 9, panel);
  cv.drawRoundRect(6, 72, 148, 50, 9, WHT);
  if (weatherOk) {
    weatherIcon(32, 97, wCode);
    char tb[8];
    snprintf(tb, sizeof tb, "%d", (int)round(tempC));
    int ts = strlen(tb) >= 3 ? 3 : 4;
    int tx = 62;
    cv.setTextSize(ts);
    cv.setTextColor(WHT);
    cv.setCursor(tx, 78);
    cv.print(tb);
    int ex = tx + strlen(tb) * 6 * ts + 4;
    cv.drawCircle(ex, 82, 3, WHT);
    cv.drawCircle(ex, 82, 2, WHT);
    cv.setTextSize(3);
    cv.setCursor(ex + 6, 78);
    cv.print("C");
    cv.setTextSize(1);
    cv.setTextColor(C565(200, 220, 255));
    cv.setCursor(tx, 112);
    cv.print(weatherText(wCode));
  } else {
    cv.setTextSize(2);
    cv.setTextColor(WHT);
    cv.setCursor(30, 90);
    cv.print("Weather...");
  }
  push();
}

// ================= faces =================
uint16_t faceBg(const String& f) {
  if (f == "happy")     return C565(20, 60, 130);
  if (f == "laugh")     return C565(130, 70, 10);
  if (f == "love")      return C565(120, 20, 80);
  if (f == "sad")       return C565(15, 25, 70);
  if (f == "surprised") return C565(70, 20, 110);
  if (f == "wink")      return C565(10, 95, 85);
  if (f == "cool")      return C565(15, 15, 20);
  if (f == "angry")     return C565(120, 10, 10);
  if (f == "listening") return C565(10, 75, 65);
  if (f == "thinking")  return C565(55, 35, 100);
  return C565(30, 32, 45);
}

const int FX = 80, FY = 66, FR = 50;

void drawMouth(const String& f, uint16_t fc) {
  if (talking) {                                   // lip-sync style flapping
    int h = 4 + (int)(14 * fabs(sin(millis() / 120.0)));
    cv.fillRoundRect(FX - 13, FY + 20, 26, h + 4, 7, DARK);
    return;
  }
  if (f == "happy" || f == "love") arc(FX, FY + 6, 28, 25, 155, 2, DARK);
  else if (f == "laugh") {
    cv.fillCircle(FX, FY + 8, 24, DARK);
    cv.fillRect(FX - 25, FY - 16, 51, 24, fc);     // cut the top half off = D-shaped mouth
    cv.fillCircle(FX, FY + 22, 10, PINK);          // tongue
  }
  else if (f == "sad")       arc(FX, FY + 44, 22, 210, 330, 2, DARK);
  else if (f == "surprised") cv.fillCircle(FX, FY + 26, 9, DARK);
  else if (f == "wink") {
    cv.fillRoundRect(FX + 2, FY + 32, 14, 12, 6, PINK);
    arc(FX, FY + 6, 28, 25, 155, 2, DARK);
  }
  else if (f == "cool")      arc(FX + 3, FY + 14, 20, 30, 150, 2, DARK);
  else if (f == "angry")     arc(FX, FY + 40, 18, 215, 325, 2, DARK);
  else if (f == "listening") cv.fillCircle(FX, FY + 26, 6, DARK);
  else if (f == "thinking")  thickLine(FX - 12, FY + 28, FX + 12, FY + 22, DARK);
  else                       cv.fillRoundRect(FX - 14, FY + 24, 28, 4, 2, DARK);
}

void dotEye(int x, int y, bool blink) {
  if (blink) cv.fillRect(x - 7, y, 14, 3, DARK);
  else cv.fillRoundRect(x - 5, y - 9, 10, 18, 5, DARK);
}

void drawEyes(const String& f) {
  int lx = FX - 18, rx = FX + 18, y = FY - 12;
  bool blink = (millis() % 4200) < 140;
  if (f == "laugh") {
    arc(lx, y + 6, 9, 200, 340, 2, DARK);
    arc(rx, y + 6, 9, 200, 340, 2, DARK);
  } else if (f == "love") {
    heart(lx, y, 9, RED);
    heart(rx, y, 9, RED);
  } else if (f == "surprised" || f == "listening") {
    int dx = (f == "listening") ? (int)(3 * sin(millis() / 400.0)) : 0;
    cv.fillCircle(lx, y, 11, WHT); cv.drawCircle(lx, y, 11, DARK);
    cv.fillCircle(rx, y, 11, WHT); cv.drawCircle(rx, y, 11, DARK);
    cv.fillCircle(lx + dx, y, 5, DARK);
    cv.fillCircle(rx + dx, y, 5, DARK);
    if (f == "surprised") {
      thickLine(lx - 8, y - 18, lx + 8, y - 20, DARK);
      thickLine(rx - 8, y - 20, rx + 8, y - 18, DARK);
    }
  } else if (f == "cool") {
    cv.fillRoundRect(FX - 36, y - 8, 32, 18, 6, BLK);
    cv.fillRoundRect(FX + 4, y - 8, 32, 18, 6, BLK);
    cv.fillRect(FX - 5, y - 4, 10, 3, BLK);
    cv.drawLine(FX - 31, y - 4, FX - 25, y - 4, WHT);
    cv.drawLine(FX + 9, y - 4, FX + 15, y - 4, WHT);
  } else if (f == "wink") {
    dotEye(lx, y, false);
    arc(rx, y + 4, 9, 200, 340, 2, DARK);
  } else if (f == "angry") {
    dotEye(lx, y, false); dotEye(rx, y, false);
    thickLine(lx - 10, y - 16, lx + 8, y - 9, DARK);
    thickLine(rx + 10, y - 16, rx - 8, y - 9, DARK);
  } else if (f == "sad") {
    dotEye(lx, y, false); dotEye(rx, y, false);
    thickLine(lx - 10, y - 9, lx + 8, y - 16, DARK);
    thickLine(rx + 10, y - 9, rx - 8, y - 16, DARK);
    cv.fillCircle(lx - 2, y + 16, 3, C565(80, 180, 255));
  } else if (f == "thinking") {
    dotEye(lx + 5, y - 3, false); dotEye(rx + 5, y - 3, false);
    thickLine(lx - 8, y - 18, lx + 8, y - 21, DARK);
  } else {
    dotEye(lx, y, blink); dotEye(rx, y, blink);
  }
}

void drawExtras(const String& f) {
  unsigned long ms = millis();
  if (f == "listening") {                          // sound waves pulsing out
    for (int i = 0; i < 3; i++) {
      int r = 56 + ((ms / 120 + i * 5) % 16);
      arc(FX, FY, r, -35, 35, 1, C565(120, 255, 230));
      arc(FX, FY, r, 145, 215, 1, C565(120, 255, 230));
    }
  } else if (f == "thinking") {                    // thought-bubble dots
    int n = (ms / 350) % 4;
    if (n > 0) cv.fillCircle(112, 26, 2, WHT);
    if (n > 1) cv.fillCircle(122, 19, 3, WHT);
    if (n > 2) cv.fillCircle(135, 11, 5, WHT);
  } else if (f == "love") {                        // floating hearts
    int xs[3] = {14, 146, 20};
    for (int i = 0; i < 3; i++) heart(xs[i], 112 - ((ms / 40 + i * 35) % 100), 5, PINK);
  }
}

void drawFace() {
  String f = face;
  cv.fillScreen(faceBg(f));
  uint16_t fc = (f == "angry") ? C565(255, 120, 40) : YEL;
  cv.fillCircle(FX, FY, FR, fc);
  drawMouth(f, fc);                                // mouth first, eyes on top
  drawEyes(f);
  drawExtras(f);
  if (faceSensorHudVisible) {
    int cm;
    bool unavailable, noEcho;
    unsigned long updated;
    portENTER_CRITICAL(&sensorMux);
    cm = obstacleDistanceCm;
    unavailable = obstacleSensorUnavailable;
    noEcho = obstacleNoEcho;
    updated = obstacleUpdatedAt;
    portEXIT_CRITICAL(&sensorMux);

    bool fresh = updated != 0 && millis() - updated <= 1000;
    bool valid = fresh && !unavailable && !noEcho && cm > 0 && cm < SENSOR_MAX_CM;
    bool clear = fresh && !unavailable && (noEcho || cm >= SENSOR_MAX_CM);
    const char* status = valid
        ? (cm <= STOP_CM ? "STOP" : cm <= 50 ? "NEAR" : "CLEAR")
        : clear ? "CLEAR" : "SENSOR OFFLINE";
    uint16_t color = !valid
        ? (clear ? C565(120, 220, 255) : C565(170, 170, 180))
        : cm <= STOP_CM ? C565(255, 65, 75)
        : cm <= 50 ? C565(255, 145, 55)
        : C565(90, 255, 140);
    char text[32];
    if (valid) snprintf(text, sizeof(text), "%d cm  %s", cm, status);
    else if (clear) strcpy(text, "CLEAR  >200 cm");
    else strcpy(text, "-- cm  SENSOR OFFLINE");

    cv.fillRoundRect(3, 3, 154, 20, 5, C565(4, 12, 20));
    cv.drawRoundRect(3, 3, 154, 20, 5, color);
    cv.setTextSize(1);
    cv.setTextColor(color);
    cv.setCursor(8, 9);
    cv.print(text);
  }
  push();
}

// ================= retro emoji screens (idle) =================
const uint16_t EM = C565(215, 255, 255);           // soft cyan-white on black, like a retro pixel face
const int NUM_EMOJI = 11;

void boldLine(int x0, int y0, int x1, int y1, uint16_t c) {
  for (int dx = -1; dx <= 1; dx++)
    for (int dy = -1; dy <= 1; dy++) cv.drawLine(x0 + dx, y0 + dy, x1 + dx, y1 + dy, c);
}

void sparkle(int x, int y, int s, uint16_t c) {    // 4-point star
  cv.fillTriangle(x, y - s, x - s / 4, y, x + s / 4, y, c);
  cv.fillTriangle(x, y + s, x - s / 4, y, x + s / 4, y, c);
  cv.fillTriangle(x - s, y, x, y - s / 4, x, y + s / 4, c);
  cv.fillTriangle(x + s, y, x, y - s / 4, x, y + s / 4, c);
}

void ovalEye(int x, int y, bool blink, uint16_t c) {
  if (blink) cv.fillRoundRect(x - 11, y - 2, 22, 5, 2, c);
  else cv.fillRoundRect(x - 9, y - 16, 18, 32, 9, c);
}

void ringEye(int x, int y, int r, uint16_t c) {
  for (int i = 0; i < 4; i++) cv.drawCircle(x, y, r - i, c);
}

void drawEmoji(int t) {
  unsigned long ms = millis();
  bool blink = (ms % 2600) < 150;
  const int lx = 48, rx = 112, ey = 46;
  cv.fillScreen(BLK);
  switch (t) {
    case 0:                                        // happy with tongue
      ovalEye(lx, ey, blink, EM); ovalEye(rx, ey, blink, EM);
      arc(80, 62, 26, 45, 135, 2, EM);
      cv.fillRoundRect(84, 86, 12, 12, 6, PINK);
      break;
    case 1:                                        // 0_0
      ringEye(lx, ey, 17, EM); ringEye(rx, ey, 17, EM);
      cv.fillRoundRect(66, 84, 28, 16, 8, EM);
      cv.fillRect(66, 84, 28, 7, BLK);
      break;
    case 2:                                        // > < big laugh
      boldLine(30, 34, 58, 48, EM); boldLine(58, 48, 30, 62, EM);
      boldLine(130, 34, 102, 48, EM); boldLine(102, 48, 130, 62, EM);
      cv.fillCircle(80, 80, 22, EM);
      cv.fillRect(50, 55, 60, 25, BLK);
      cv.fillCircle(80, 94, 8, PINK);
      break;
    case 3: {                                      // sparkle eyes + blush
      int sz = 16 + (int)(2 * sin(ms / 200.0));
      sparkle(lx, ey, sz, EM); sparkle(rx, ey, sz, EM);
      arc(72, 82, 7, 0, 180, 1, EM); arc(88, 82, 7, 0, 180, 1, EM);
      for (int i = 0; i < 3; i++) {
        int xl = 12 + i * 8, xr = 116 + i * 8;
        cv.drawLine(xl, 92, xl + 4, 84, PINK); cv.drawLine(xl + 1, 92, xl + 5, 84, PINK);
        cv.drawLine(xr, 92, xr + 4, 84, PINK); cv.drawLine(xr + 1, 92, xr + 5, 84, PINK);
      }
      break;
    }
    case 4:                                        // sunglasses
      cv.fillRoundRect(22, 32, 50, 28, 8, EM);
      cv.fillRoundRect(88, 32, 50, 28, 8, EM);
      cv.fillRect(72, 38, 16, 5, EM);
      cv.drawLine(32, 52, 42, 38, BLK); cv.drawLine(33, 52, 43, 38, BLK);
      cv.drawLine(98, 52, 108, 38, BLK); cv.drawLine(99, 52, 109, 38, BLK);
      arc(86, 66, 26, 40, 120, 2, EM);
      break;
    case 5: {                                      // heart eyes (beating)
      int hs = 14 + (int)((ms / 250) % 2) * 2;
      heart(lx, ey, hs, RED); heart(rx, ey, hs, RED);
      arc(80, 64, 24, 40, 140, 2, EM);
      break;
    }
    case 6: {                                      // sleepy + floating Z
      arc(lx, ey - 4, 14, 30, 150, 2, EM);
      arc(rx, ey - 4, 14, 30, 150, 2, EM);
      cv.fillCircle(80, 88, 5, EM);
      int zy = 36 - (int)((ms / 120) % 16);
      cv.setTextColor(EM);
      cv.setTextSize(2); cv.setCursor(118, zy); cv.print("Z");
      cv.setTextSize(1); cv.setCursor(138, zy - 14); cv.print("z");
      break;
    }
    case 7: {                                      // sad with falling tear
      ovalEye(lx, ey, blink, EM); ovalEye(rx, ey, blink, EM);
      cv.fillCircle(lx + 4, ey + 20 + (int)((ms / 50) % 30), 4, C565(80, 180, 255));
      arc(80, 112, 22, 215, 325, 2, EM);
      break;
    }
    case 8: {                                      // surprised, eyes dart around
      int dx = (int)(3 * sin(ms / 500.0));
      cv.fillCircle(lx, ey, 17, EM); cv.fillCircle(lx + dx, ey, 7, BLK);
      cv.fillCircle(rx, ey, 17, EM); cv.fillCircle(rx + dx, ey, 7, BLK);
      ringEye(80, 90, 10, EM);
      break;
    }
    case 9: {                                      // angry (red)
      uint16_t rc = C565(255, 90, 90);
      ovalEye(lx, ey + 8, false, rc); ovalEye(rx, ey + 8, false, rc);
      boldLine(lx - 14, ey - 22, lx + 12, ey - 10, rc);
      boldLine(rx + 14, ey - 22, rx - 12, ey - 10, rc);
      arc(80, 112, 20, 215, 325, 2, rc);
      break;
    }
    default:                                       // wink + tongue
      ovalEye(lx, ey, false, EM);
      arc(rx, ey + 6, 14, 200, 340, 2, EM);
      arc(80, 62, 26, 45, 135, 2, EM);
      cv.fillRoundRect(84, 86, 12, 16, 6, PINK);
      break;
  }
  push();
}

void drawObstacleMonitor() {
  int cm;
  bool unavailable, noEcho;
  unsigned long updated;
  portENTER_CRITICAL(&sensorMux);
  cm = obstacleDistanceCm;
  unavailable = obstacleSensorUnavailable;
  noEcho = obstacleNoEcho;
  updated = obstacleUpdatedAt;
  portEXIT_CRITICAL(&sensorMux);

  bool stale = updated == 0 || millis() - updated > 1000;
  bool valid = !stale && !unavailable && !noEcho && cm < SENSOR_MAX_CM;
  bool clear = !stale && !unavailable && (noEcho || cm >= SENSOR_MAX_CM);
  uint16_t color = C565(90, 255, 140);
  const char* status = "CLEAR";
  if (stale || unavailable) {
    status = "SENSOR UNAVAILABLE";
    color = C565(170, 170, 180);
  } else if (noEcho || cm >= SENSOR_MAX_CM) {
    status = "NO OBSTACLE DETECTED";
    color = C565(120, 220, 255);
  } else if (cm <= STOP_CM) {
    status = "VERY CLOSE";
    color = C565(255, 65, 75);
  } else if (cm <= 50) {
    status = "WARNING";
    color = C565(255, 145, 55);
  } else if (cm <= 100) {
    status = "NEAR";
    color = C565(255, 220, 70);
  }

  cv.fillScreen(C565(4, 12, 20));
  cv.setTextSize(1);
  cv.setTextColor(C565(120, 200, 255));
  cv.setCursor(8, 5);
  cv.print("OBSTACLE MONITOR");

  char distanceText[16];
  if (valid) snprintf(distanceText, sizeof(distanceText), "%d cm", cm);
  else if (clear) strcpy(distanceText, ">200 cm");
  else strcpy(distanceText, "-- cm");
  cv.setTextSize(3);
  cv.setTextColor(color);
  cv.setCursor(8, 22);
  cv.print(distanceText);
  cv.setTextSize(1);
  cv.setCursor(8, 53);
  cv.print(status);

  const int left = 18, right = 145, centerY = 86;
  cv.drawFastHLine(left, centerY, right - left, C565(90, 110, 130));
  cv.fillRoundRect(8, centerY - 8, 19, 16, 3, C565(80, 190, 255));
  cv.drawFastVLine(22, centerY - 5, 10, WHT);
  int objectX = valid ? left + (cm * (right - left) / SENSOR_MAX_CM) : right;
  if (valid) cv.fillRect(objectX - 2, centerY - 12, 5, 24, color);
  cv.drawFastVLine(left, centerY - 3, 7, C565(150, 170, 190));
  cv.drawFastVLine((left + right) / 2, centerY - 3, 7, C565(150, 170, 190));
  cv.drawFastVLine(right, centerY - 3, 7, C565(150, 170, 190));
  cv.setTextColor(C565(180, 195, 210));
  cv.setCursor(8, 108);
  cv.print("ROBOT");
  cv.setCursor(34, 108);
  cv.print("0    100    200 cm");
  push();
}

void nextPage() {                                  // dashboard, emoji, obstacle monitor
  idlePage = (idlePage + 1) % 3;
  pageChanged = millis();
  if (idlePage == 1) {
    int t;
    do { t = esp_random() % NUM_EMOJI; } while (t == emojiType);
    emojiType = t;
  } else if (idlePage == 0) {
    newWallpaper();                                // fresh random wallpaper behind each clock screen
  }
}

void startIdle() {
  mode = MODE_IDLE;
  talking = false;
  idlePage = 0;
  pageChanged = millis();
  newWallpaper();
}

// ================= motors =================
void applyMotorDirections(const int dirs[4]) {
  byte bits = 0;
  for (int m = 0; m < 4; m++) {
    if (dirs[m] > 0) bits |= (1 << A_BIT[m]);
    if (dirs[m] < 0) bits |= (1 << B_BIT[m]);
    digitalWrite(PWM_PINS[m], dirs[m] != 0);
  }
  digitalWrite(SR_LATCH, LOW);
  shiftOut(SR_SER, SR_CLK, MSBFIRST, bits);
  digitalWrite(SR_LATCH, HIGH);
}

void drive(int left, int right) {                  // 1 forward, -1 reverse, 0 stop; M1+M2 = left, M3+M4 = right
  const int dirs[4] = {left, left, right, right};
  applyMotorDirections(dirs);
}

void driveManualStraight(int direction) {
  // Front channels M1/M2 are wired opposite to rear channels M3/M4.
  const int dirs[4] = {direction, direction, -direction, -direction};
  applyMotorDirections(dirs);
}

// ================= obstacle sensor + idle wandering =================
int readCm() {                                     // Latest filtered measurement; acquisition runs independently.
  portENTER_CRITICAL(&sensorMux);
  int cm = obstacleDistanceCm;
  bool unavailable = obstacleSensorUnavailable || obstacleUpdatedAt == 0 ||
                     millis() - obstacleUpdatedAt > 1000;
  portEXIT_CRITICAL(&sensorMux);
  return unavailable ? 0 : cm;
}

void handleTelemetry() {
  int cm;
  bool unavailable, noEcho;
  unsigned long updated;
  portENTER_CRITICAL(&sensorMux);
  cm = obstacleDistanceCm;
  unavailable = obstacleSensorUnavailable;
  noEcho = obstacleNoEcho;
  updated = obstacleUpdatedAt;
  portEXIT_CRITICAL(&sensorMux);

  bool stale = updated == 0 || millis() - updated > 1000;
  if (stale || unavailable || noEcho || cm <= 0 || cm >= SENSOR_MAX_CM) {
    server.send(503, "application/json", "{\"message\":\"distance sensor has no recent reading\"}");
    return;
  }
  char payload[96];
  snprintf(payload, sizeof(payload),
           "{\"distanceCm\":%d,\"unit\":\"cm\",\"timestampMs\":%lu}",
           cm, millis());
  server.send(200, "application/json", payload);
}

void ultrasonicTask(void*) {
  int history[3] = {0, 0, 0};
  uint8_t historyCount = 0;
  uint8_t historyPos = 0;
  uint8_t noEchoCount = 0;
  uint8_t invalidStreak = 0;
  TickType_t wake = xTaskGetTickCount();

  for (;;) {
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);

    unsigned long pulseUs = pulseIn(ECHO_PIN, HIGH, 12000);
    bool unavailable = false;
    bool noEcho = pulseUs == 0;
    int cm = 999;

    if (noEcho) {
      invalidStreak = 0;
      if (noEchoCount < 2) noEchoCount++;
      if (noEchoCount >= 2) {
        historyCount = 0;
        historyPos = 0;
      }
    } else if (pulseUs >= 120 && pulseUs <= 11600) {
      invalidStreak = 0;
      noEchoCount = 0;
      history[historyPos] = (int)(pulseUs / 58);
      historyPos = (historyPos + 1) % 3;
      if (historyCount < 3) historyCount++;

      int sorted[3];
      for (uint8_t i = 0; i < historyCount; i++) sorted[i] = history[i];
      for (uint8_t i = 1; i < historyCount; i++) {
        int value = sorted[i];
        int j = i - 1;
        while (j >= 0 && sorted[j] > value) {
          sorted[j + 1] = sorted[j];
          j--;
        }
        sorted[j + 1] = value;
      }
      cm = sorted[historyCount / 2];
    } else {
      if (invalidStreak < 5) invalidStreak++;
      unavailable = invalidStreak >= 5;
      portENTER_CRITICAL(&sensorMux);
      cm = obstacleDistanceCm;
      noEcho = obstacleNoEcho;
      portEXIT_CRITICAL(&sensorMux);
    }

    portENTER_CRITICAL(&sensorMux);
    if (pulseUs == 0 || (pulseUs >= 120 && pulseUs <= 11600)) {
      obstacleDistanceCm = cm;
      obstacleNoEcho = noEcho;
    }
    obstacleSensorUnavailable = unavailable;
    obstacleUpdatedAt = millis();
    portEXIT_CRITICAL(&sensorMux);
    vTaskDelayUntil(&wake, pdMS_TO_TICKS(200));
  }
}

void wanderStep(unsigned long now) {
  if (moving || mode != MODE_IDLE) {               // voice command or a face is active: wandering yields
    if (ws != W_WAIT && !moving) drive(0, 0);
    ws = W_WAIT;
    nextWander = now + WANDER_EVERY_MS;
    return;
  }
  switch (ws) {
    case W_WAIT:
      if ((long)(now - nextWander) < 0) break;
      if (readCm() < STOP_CM || esp_random() % 3 == 0) {     // blocked, or just feel like turning
        turnDir = (esp_random() & 1) ? 1 : -1;
        drive(turnDir, -turnDir);
        wsStart = now; wsDur = 250 + esp_random() % 300; ws = W_TURN;
      } else {
        drive(1, 1);
        wsStart = now; wsDur = WANDER_STEP_MS; ws = W_OUT;
      }
      break;
    case W_OUT: {
      bool blocked = false;
      if (now - lastDist >= 60) { lastDist = now; blocked = readCm() < STOP_CM; }
      if (blocked || now - wsStart >= wsDur) {
        unsigned long went = now - wsStart;
        if (went < 80) { drive(0, 0); ws = W_WAIT; nextWander = now + WANDER_EVERY_MS; }
        else { drive(-1, -1); wsStart = now; wsDur = went; ws = W_BACK; }   // back up the same distance
      }
      break;
    }
    case W_BACK:
    case W_TURN:
      if (now - wsStart >= wsDur) { drive(0, 0); ws = W_WAIT; nextWander = now + WANDER_EVERY_MS; }
      break;
  }
}

// ================= HTTP handlers =================
bool fetchCameraFrame() {
  if (!cameraFrame) {
    Serial.println("[camera] local frame buffer unavailable");
    return false;
  }

  HTTPClient http;
  http.setConnectTimeout(500);
  http.setTimeout(1000);
  http.setReuse(false);

  String url = String("http://") + CAMERA_IP + ":" + String(CAMERA_PORT) + CAMERA_PATH;
  if (!http.begin(url)) {
    Serial.println("[camera] HTTP client initialization failed");
    return false;
  }

  int code = http.GET();
  if (code != 200) {
    Serial.printf("[camera] GET failed: HTTP %d (%s)\n",
                  code, http.errorToString(code).c_str());
    http.end();
    return false;
  }

  int size = http.getSize();
  if (size == 0 || (size > 0 && (size <= 2 || size > (int)CAMERA_BUFFER_SIZE))) {
    Serial.printf("[camera] invalid response size: %d bytes\n", size);
    http.end();
    return false;
  }

  WiFiClient* stream = http.getStreamPtr();
  size_t got = 0;
  unsigned long started = millis();
  if (size > 0) {
    while (got < (size_t)size && millis() - started < 1500) {
      size_t avail = stream->available();
      if (avail > 0) {
        got += stream->readBytes(cameraFrame + got, min(avail, (size_t)size - got));
      } else if (!stream->connected()) {
        break;
      } else {
        delay(1);
      }
    }
    http.end();
    if (got != (size_t)size) {
      Serial.printf("[camera] incomplete JPEG: received %u of %d bytes\n",
                    (unsigned)got, size);
      return false;
    }
  } else {
    while (got < CAMERA_BUFFER_SIZE && millis() - started < 1500) {
      size_t avail = stream->available();
      if (avail > 0) {
        got += stream->readBytes(cameraFrame + got, min(avail, CAMERA_BUFFER_SIZE - got));
      } else if (!stream->connected()) {
        break;
      } else {
        delay(1);
      }
    }
    http.end();
    if (got <= 2) {
      Serial.printf("[camera] empty response: %u bytes\n", (unsigned)got);
      return false;
    }
  }

  cameraFrameLength = got;
  Serial.printf("[camera] received %u-byte frame\n", (unsigned)got);
  return true;
}

void handleFrame() {
  if (!cameraFrame || !fetchCameraFrame()) {
    cameraAvailable = false;
    server.send(503, "text/plain", "camera frame unavailable");
    return;
  }
  if (cameraFrameLength < 2 || cameraFrame[0] != 0xFF || cameraFrame[1] != 0xD8) {
    cameraAvailable = false;
    server.send(503, "text/plain", "camera frame unavailable");
    return;
  }

  cameraAvailable = true;
  server.sendHeader("Cache-Control", "no-store");
  server.setContentLength(cameraFrameLength);
  server.send(200, "image/jpeg", "");
  server.sendContent(reinterpret_cast<const char*>(cameraFrame), cameraFrameLength);
}

void handleCameraStatus() {
  server.send(
      200,
      "application/json",
      cameraAvailable ? "{\"connected\":true}" : "{\"connected\":false}");
}

void drawCameraDistanceHud() {
  int cm;
  bool unavailable, noEcho;
  unsigned long updated;
  portENTER_CRITICAL(&sensorMux);
  cm = obstacleDistanceCm;
  unavailable = obstacleSensorUnavailable;
  noEcho = obstacleNoEcho;
  updated = obstacleUpdatedAt;
  portEXIT_CRITICAL(&sensorMux);

  bool fresh = updated != 0 && millis() - updated <= 1000;
  bool valid = fresh && !unavailable && !noEcho && cm > 0 && cm < SENSOR_MAX_CM;
  bool clear = fresh && !unavailable && (noEcho || cm >= SENSOR_MAX_CM);
  const char* status = valid
      ? (cm <= STOP_CM ? "STOP" : cm <= 50 ? "NEAR" : "CLEAR")
      : clear ? "CLEAR" : "SENSOR OFFLINE";
  uint16_t color = !valid
      ? (clear ? C565(120, 220, 255) : C565(170, 170, 180))
      : cm <= STOP_CM ? C565(255, 65, 75)
      : cm <= 50 ? C565(255, 145, 55)
      : C565(90, 255, 140);
  char text[32];
  if (valid) snprintf(text, sizeof(text), "%d cm  %s", cm, status);
  else if (clear) strcpy(text, "CLEAR  >200 cm");
  else strcpy(text, "-- cm  SENSOR OFFLINE");

  tft.fillRoundRect(3, 3, 154, 20, 5, C565(4, 12, 20));
  tft.drawRoundRect(3, 3, 154, 20, 5, color);
  tft.setTextSize(1);
  tft.setTextColor(color);
  tft.setCursor(8, 9);
  tft.print(text);
}

bool renderCameraFrame(bool clearScreen = true) {
  size_t len = cameraFrameLength;
  if (!cameraFrame || len < 2) {
    Serial.println("[camera] no frame data to render");
    return false;
  }
  if (clearScreen) tft.fillScreen(ST77XX_BLACK);

  if (cameraFrame[0] == 0xFF && cameraFrame[1] == 0xD8) {
    uint16_t w = 0, h = 0;
    if (TJpgDec.getJpgSize(&w, &h, cameraFrame, len) != 0) {
      Serial.println("[camera] JPEG header decode failed");
      return false;
    }
    Serial.printf("[camera] decoding JPEG %ux%u\n", w, h);
    uint8_t scale = 1;
    while (scale < 8 && (w / scale > 160 || h / scale > 128)) scale *= 2;
    TJpgDec.setJpgScale(scale);
    int ox = max(0, (160 - (int)(w / scale)) / 2);
    int oy = max(0, (128 - (int)(h / scale)) / 2);
    JRESULT result = TJpgDec.drawJpg(ox, oy, cameraFrame, len);
    if (result != JDR_OK) {
      Serial.printf("[camera] JPEG render failed: decoder result %d\n", result);
      return false;
    }
  } else if (len == 160 * 120 * 2) {
    uint16_t* pixels = (uint16_t*)cameraFrame;
    for (size_t i = 0; i < 160 * 120; i++) {
      pixels[i] = (pixels[i] >> 8) | (pixels[i] << 8);
    }
    tft.drawRGBBitmap(0, 4, pixels, 160, 120);
  } else {
    Serial.printf("[camera] unsupported frame format, %u bytes\n", (unsigned)len);
    return false;
  }
  drawCameraDistanceHud();
  return true;
}

void rememberDisplayState() {
  previousMode = mode;
  previousIdlePage = idlePage;
  previousFace = face;
  previousTalking = talking;
  previousInteract = lastInteract;
}

void restoreDisplayState() {
  mode = previousMode;
  idlePage = previousIdlePage;
  face = previousFace;
  talking = previousTalking;
  lastInteract = previousInteract;
  pageChanged = millis();
  lastSec = -2;
  lastSensorDraw = 0;
  if (mode == MODE_IDLE) {
    if (idlePage == 0) {
      struct tm now;
      bool haveTime = getLocalTime(&now, 0);
      renderIdle(haveTime, now);
    } else if (idlePage == 1) {
      drawEmoji(emojiType);
    } else if (idlePage == 2) {
      drawObstacleMonitor();
    }
  } else if (mode == MODE_FACE) {
    drawFace();
  }
}

void beginCameraMode(Mode nextMode, unsigned long durationMs, bool randomPreview = false) {
  if (mode == CAMERA_PREVIEW || mode == DISPLAYING_PHOTO || !cameraFrame) return;
  rememberDisplayState();
  mode = nextMode;
  cameraModeRandom = randomPreview;
  cameraDurationMs = durationMs;
  cameraModeUntil = 0;
  cameraHasRenderedFrame = false;
  cameraFailStreak = 0;
  nextCameraCheckAt = millis() + CAMERA_CHECK_INTERVAL_MS;
  nextCameraFrameAt = 0;
  photoRequested = nextMode == DISPLAYING_PHOTO;
  ws = W_WAIT;
  drive(0, 0);
}

void serviceCamera(unsigned long now) {
  if (mode == DISPLAYING_PHOTO) {
    if (photoRequested) {
      photoRequested = false;
      if (!fetchCameraFrame() || !renderCameraFrame(true)) {
        Serial.println("[camera] photo capture or render failed");
        cameraAvailable = false;
        restoreDisplayState();
        return;
      }
      cameraAvailable = true;
      cameraModeUntil = millis() + PHOTO_MS;
      cameraHasRenderedFrame = true;
    } else if ((long)(now - cameraModeUntil) >= 0) {
      restoreDisplayState();
    }
    return;
  }

  if (mode == CAMERA_PREVIEW) {
    if (cameraHasRenderedFrame && (long)(now - cameraModeUntil) >= 0) {
      cameraModeRandom = false;
      restoreDisplayState();
      nextPreviewAt = millis() + AUTO_PREVIEW_INTERVAL_MS;
      return;
    }
    if ((long)(now - nextCameraFrameAt) >= 0) {
      bool firstFrame = !cameraHasRenderedFrame;
      if (!fetchCameraFrame() || !renderCameraFrame(firstFrame)) {
        Serial.println("[camera] preview fetch or render failed");
        cameraFailStreak++;
        if (firstFrame || cameraFailStreak >= 3) {
          cameraAvailable = false;
          cameraModeRandom = false;
          restoreDisplayState();
          nextCameraCheckAt = millis() + CAMERA_CHECK_INTERVAL_MS;
          nextPreviewAt = millis() + AUTO_PREVIEW_INTERVAL_MS;
        } else {
          nextCameraFrameAt = millis() + PREVIEW_FRAME_INTERVAL_MS;
        }
        return;
      }
      cameraFailStreak = 0;
      cameraAvailable = true;
      if (!cameraHasRenderedFrame) {
        cameraHasRenderedFrame = true;
        cameraModeUntil = millis() + cameraDurationMs;
      }
      nextCameraFrameAt = millis() + PREVIEW_FRAME_INTERVAL_MS;
    }
    return;
  }

  if (!cameraAvailable && !moving && !startupDashboardUntil &&
      (long)(now - nextCameraCheckAt) >= 0 && cameraFrame) {
    nextCameraCheckAt = now + CAMERA_CHECK_INTERVAL_MS;
    cameraAvailable = fetchCameraFrame();
    if (cameraAvailable) cameraFrameLength = 0;
  }
  if (!moving && !startupDashboardUntil &&
      (long)(now - nextPreviewAt) >= 0 && cameraFrame) {
    nextPreviewAt = now + AUTO_PREVIEW_INTERVAL_MS;
    beginCameraMode(CAMERA_PREVIEW, AUTO_PREVIEW_DURATION_MS, true);
  }
}

void serviceFaceSensorHud() {
  bool faceActive = mode == MODE_FACE ||
                    ((mode == CAMERA_PREVIEW || mode == DISPLAYING_PHOTO) &&
                     previousMode == MODE_FACE);
  faceSensorHudVisible = faceActive;
}

void handleCapture() {
  if (mode == CAMERA_PREVIEW && cameraModeRandom) {
    cameraModeRandom = false;
    restoreDisplayState();
  }
  if (mode == CAMERA_PREVIEW || mode == DISPLAYING_PHOTO || !cameraFrame) {
    server.send(409, "text/plain", "camera busy or unavailable");
    return;
  }
  if (!cameraAvailable) {
    cameraAvailable = fetchCameraFrame();
    if (!cameraAvailable) {
      nextCameraCheckAt = millis() + CAMERA_CHECK_INTERVAL_MS;
      server.send(503, "text/plain", "camera unavailable");
      return;
    }
  }
  beginCameraMode(DISPLAYING_PHOTO, PHOTO_MS);
  server.send(200, "text/plain", "accepted");
}

void handlePreview() {
  if (mode == CAMERA_PREVIEW && cameraModeRandom) {
    cameraModeRandom = false;
    restoreDisplayState();
  }
  if (mode == CAMERA_PREVIEW || mode == DISPLAYING_PHOTO || !cameraFrame) {
    server.send(409, "text/plain", "camera busy or unavailable");
    return;
  }
  if (!cameraAvailable) {
    cameraAvailable = fetchCameraFrame();
    if (!cameraAvailable) {
      nextCameraCheckAt = millis() + CAMERA_CHECK_INTERVAL_MS;
      server.send(503, "text/plain", "camera unavailable");
      return;
    }
  }
  unsigned long duration = server.hasArg("duration_ms") ? server.arg("duration_ms").toInt() : PREVIEW_MS;
  duration = constrain(duration, 1000UL, 30000UL);
  beginCameraMode(CAMERA_PREVIEW, duration);
  server.send(200, "text/plain", "accepted");
}

void handleCmd() {                                 // /cmd?c=forward&ms=1500
  String c = server.arg("c");
  long ms = server.hasArg("ms") ? server.arg("ms").toInt() : 1000;
  ms = constrain(ms, 100, 5000);
  if (c == "forward")       driveManualStraight(1);
  else if (c == "backward") driveManualStraight(-1);
  else if (c == "left")     drive(-1, 1);          // swap these two if it turns the wrong way
  else if (c == "right")    drive(1, -1);
  else if (c == "stop")     drive(0, 0);
  else { server.send(400, "text/plain", "bad command"); return; }
  moving = (c != "stop");
  movingForward = (c == "forward");
  ws = W_WAIT;                                     // a voice command cancels any wander in progress
  nextWander = millis() + WANDER_EVERY_MS;
  stopAt = millis() + ms;
  lastInteract = millis();
  server.send(200, "text/plain", "ok");
}

void handleFace() {                                // /face?s=happy&talk=1
  String nextFace = server.arg("s");
  if (nextFace == "") nextFace = "neutral";
  bool nextTalking = server.arg("talk") == "1";
  if (nextFace == "listening") muteMicRequested = false;
  else if (nextFace == "thinking" || nextFace == "processing" || nextFace == "speaking") {
    muteMicRequested = true;
  }
  if (startupDashboardUntil && (long)(millis() - startupDashboardUntil) < 0) {
    face = nextFace;
    talking = nextTalking;
    mode = MODE_IDLE;
    idlePage = 0;
    lastInteract = millis();
    server.send(200, "text/plain", "ok");
    return;
  }
  if (mode == CAMERA_PREVIEW && cameraModeRandom) {
    if (nextFace == "listening") {
      previousMode = MODE_FACE;
      previousFace = nextFace;
      previousTalking = nextTalking;
      previousInteract = millis();
      lastInteract = millis();
      server.send(200, "text/plain", "ok");
      return;
    }
    cameraModeRandom = false;
    restoreDisplayState();
  }
  if (mode == CAMERA_PREVIEW || mode == DISPLAYING_PHOTO) {
    previousMode = MODE_FACE;
    previousFace = nextFace;
    previousTalking = nextTalking;
    previousInteract = millis();
  } else {
    face = nextFace;
    talking = nextTalking;
    mode = MODE_FACE;
  }
  lastInteract = millis();
  server.send(200, "text/plain", "ok");
}

void handleIdle() {                                // /idle
  startIdle();
  server.send(200, "text/plain", "ok");
}

// ================= setup / loop =================
void setup() {
  Serial.begin(115200);

  pinMode(SR_SER, OUTPUT);
  pinMode(SR_CLK, OUTPUT);
  pinMode(SR_LATCH, OUTPUT);
  pinMode(SR_OE, OUTPUT);
  for (int i = 0; i < 4; i++) pinMode(PWM_PINS[i], OUTPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);
  drive(0, 0);
  digitalWrite(SR_OE, LOW);

  SPI.begin(18, -1, 23, TFT_CS);
  tft.initR(INITR_BLACKTAB);                       // try INITR_GREENTAB or INITR_REDTAB if colours/edges look off
  tft.setRotation(3);                              // landscape 160 x 128, flipped 180 degrees
  splash("Hello!", "Connecting Wi-Fi...");

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(300); Serial.print("."); }
  WiFi.setSleep(false);
  configTime(GMT_OFFSET_SEC, 0, "pool.ntp.org", "time.google.com", "time.nist.gov");
  Serial.print("\nESP32 IP: ");
  Serial.println(WiFi.localIP());
  splash("Connected", WiFi.localIP().toString().c_str());   // put this IP in the laptop's .env
  delay(2000);

  // Fetch initial weather before allocating cameraFrame so TLS has full contiguous heap.
  fetchWeather();
  if (!weatherOk) {
    delay(300);
    fetchWeather();
  }

  cameraFrame = (uint8_t*)malloc(CAMERA_BUFFER_SIZE);
  if (!cameraFrame) {
    cameraFrame = (uint8_t*)malloc(20480);
  }
  if (cameraFrame) {
    TJpgDec.setJpgScale(1);
    TJpgDec.setSwapBytes(false);
    TJpgDec.setCallback(jpgOutput);
  } else {
    Serial.println("[camera] frame buffer allocation failed");
  }

  randomSeed(esp_random());
  adc1_config_width(ADC_WIDTH_BIT_12);
  adc1_config_channel_atten(ADC1_CHANNEL_6, ADC_ATTEN_DB_11);
  pinMode(MIC_DO, INPUT);
  pinMode(I2S_DOUT, OUTPUT);
  digitalWrite(I2S_DOUT, LOW);
  setupSpeakerI2s();

  server.on("/cmd", handleCmd);
  server.on("/telemetry", handleTelemetry);
  server.on("/frame", handleFrame);
  server.on("/camera/status", handleCameraStatus);
  server.on("/face", handleFace);
  server.on("/idle", handleIdle);
  server.on("/capture", handleCapture);
  server.on("/preview", handlePreview);
  server.begin();

  audioServer.begin();
  xTaskCreatePinnedToCore(audioTask, "audio", 8192, NULL, 1, NULL, 1);
  if (xTaskCreatePinnedToCore(ultrasonicTask, "ultrasonic", 2048, NULL, 1, NULL, 0) != pdPASS) {
    Serial.println("[sonar] ultrasonic task creation failed");
  }

  startIdle();
  struct tm bootTime;
  bool haveBootTime = getLocalTime(&bootTime, 500);
  renderIdle(haveBootTime, bootTime);
  lastSec = haveBootTime ? bootTime.tm_sec : -1;

  unsigned long readyAt = millis();
  pageChanged = readyAt;
  startupDashboardUntil = readyAt + INFO_MS;
  nextCameraCheckAt = readyAt + 2000;
  nextPreviewAt = readyAt + INFO_MS;
  nextWander = readyAt + WANDER_EVERY_MS;
}

void loop() {
  server.handleClient();
  unsigned long now = millis();
  if (startupDashboardUntil && (long)(now - startupDashboardUntil) >= 0) {
    startupDashboardUntil = 0;
    if (lastInteract && now - lastInteract <= IDLE_AFTER_MS) mode = MODE_FACE;
  }

  if (mode == MODE_IDLE) {
    unsigned long pageDuration = idlePage == 1 ? EMOJI_MS : idlePage == 2 ? SENSOR_PAGE_MS : INFO_MS;
    if (now - pageChanged >= pageDuration) nextPage();
  }

  serviceCamera(now);
  serviceFaceSensorHud();

  if (moving && (long)(now - stopAt) >= 0) {       // auto-stop safety
    drive(0, 0);
    moving = false;
  }

  if (moving && movingForward && STOP_FOR_OBSTACLE_ON_VOICE && now - lastVoiceDist >= 60) {
    lastVoiceDist = now;
    if (readCm() < STOP_CM) { drive(0, 0); moving = false; movingForward = false; }   // obstacle: stop early
  }

  wanderStep(now);

  unsigned long faceTimeout = face == "listening" ? LISTENING_FACE_MS : IDLE_AFTER_MS;
  if (mode == MODE_FACE && now - lastInteract > faceTimeout) startIdle();

  if (mode == MODE_FACE) {
    static unsigned long lastFrame = 0;
    if (now - lastFrame >= 80) { lastFrame = now; drawFace(); }
  } else if (mode == MODE_IDLE) {
    if (idlePage == 1) {
      static unsigned long lastEmoji = 0;
      if (now - lastEmoji >= 60) { lastEmoji = now; drawEmoji(emojiType); }
    } else if (idlePage == 2) {
      if (now - lastSensorDraw >= SENSOR_REFRESH_MS) {
        lastSensorDraw = now;
        drawObstacleMonitor();
      }
    } else {
      struct tm t;
      bool haveTime = getLocalTime(&t, 0);
      int sec = haveTime ? t.tm_sec : -1;
      if (sec != lastSec) { lastSec = sec; renderIdle(haveTime, t); }
    }
  }

  if (WiFi.status() == WL_CONNECTED && mode == MODE_IDLE && idlePage == 0 &&
      (long)(now - nextWeather) >= 0) {
    fetchWeather();
  }
}
