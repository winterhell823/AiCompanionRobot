# working sketch for testing all components
// ESP32 companion robot: motor web server + TFT display + voice (analog mic sampled on D34, speaker streamed over Wi-Fi)
//   Idle  : cycles clock + weather (random wallpaper) -> random retro emoji face -> SONAR page (live front distance)
//           and patrols in place: a small forward / backward / left / right move every 5 s, front distance scan every 3 s
//   Active: animated emoji faces, chosen by the laptop (/face?s=happy&talk=1)
// Libraries to install: "Adafruit GFX Library" and "Adafruit ST7735 and ST7789 Library"
#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <time.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include "driver/i2s.h"
#include "driver/adc.h"

// ================= EDIT THESE =================
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
const float LAT = 28.4595;                    // Gurugram, change for your city
const float LON = 77.0266;
const long  GMT_OFFSET_SEC = 19800;           // IST = UTC+5:30
const unsigned long IDLE_AFTER_MS = 20000;    // face -> wallpaper after this long with no activity
const unsigned long INFO_MS  = 5000;          // idle: clock + weather screen stays this long
const unsigned long EMOJI_MS = 5000;          // idle: then a random emoji face stays this long
const unsigned long SONAR_MS = 5000;          // idle: then the sonar distance page stays this long
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
const unsigned long WANDER_EVERY_MS = 5000;        // idle: one small move every 5 s
const unsigned long SCAN_EVERY_MS   = 3000;        // idle: scan the distance in front every 3 s
const unsigned long MOVE_MS         = 450;         // idle: length of each little move (it then undoes it, so it stays put)
const int RADIUS_CM    = 8;                        // idle: drift allowed (at rest) from the "home" distance before it drives back; each move adds ~10 cm on top
const int CM_VALID_MAX = 200;                      // readings at or above this = nothing in range

// Idle patrol: forward -> backward -> left -> right, each a small move followed by the same move undone.
// The front sensor remembers how far the wall/object was when idle began ("home") and corrects any drift.
enum WState { W_WAIT, W_OUT, W_PAUSE, W_BACK, W_CORR };
WState ws = W_WAIT;
unsigned long wsStart = 0, wsDur = 0, outDur = 0, nextWander = 0, lastDist = 0, lastVoiceDist = 0;
int moveKind = 0, patternIdx = 0, corrDir = 1;     // kinds: 0 forward, 1 backward, 2 left, 3 right
const char* lastMove = "-";
bool movingForward = false;

int frontCm = 999;                                 // last scanned distance in front (cm, 999 = nothing in range)
int homeCm = 0;                                    // reference distance (0 = none yet)
int devCount = 0;
unsigned long scanAt = 0;
const int HIST = 24;
uint8_t hist[HIST];                                // recent distances for the sonar graph
int histCount = 0, histPos = 0;

const char* stateName() {
  switch (ws) {
    case W_WAIT: return "holding";
    case W_CORR: return "returning home";
    default:     return "moving";
  }
}

Adafruit_ST7735 tft(TFT_CS, TFT_DC, TFT_RST);
GFXcanvas16 cv(160, 128);          // draw off-screen, then push once = no flicker
WebServer server(80);

#define C565(r, g, b) ((((r) & 0xF8) << 8) | (((g) & 0xFC) << 3) | (((b) & 0xF8) >> 3))
const uint16_t YEL = C565(255, 205, 40), DARK = C565(45, 28, 10), WHT = 0xFFFF;
const uint16_t RED = C565(235, 40, 60), PINK = C565(255, 110, 140), BLK = 0x0000;

// ---------- state ----------
enum Mode { MODE_IDLE, MODE_FACE };
Mode mode = MODE_IDLE;
String face = "happy";
bool talking = false;
unsigned long lastInteract = 0;

uint32_t wallSeed = 1;
int wallType = 0;
unsigned long wallChanged = 0;
int idlePage = 0;                 // idle page: 0 = clock/weather, 1 = emoji face, 2 = sonar distance
int emojiType = 0;
unsigned long pageChanged = 0;
int lastSec = -2;

float tempC = 0;
int wCode = -1;
bool weatherOk = false;
unsigned long nextWeather = 0;

unsigned long stopAt = 0;
bool moving = false;

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
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  String url = String("https://api.open-meteo.com/v1/forecast?latitude=") + String(LAT, 4) +
               "&longitude=" + String(LON, 4) + "&current=temperature_2m,weather_code&timezone=auto";
  if (http.begin(client, url)) {
    http.setTimeout(5000);
    if (http.GET() == 200) {
      String b = http.getString();
      int i = b.lastIndexOf("\"temperature_2m\":");
      int j = b.lastIndexOf("\"weather_code\":");
      if (i > 0 && j > 0) {
        tempC = b.substring(i + 17).toFloat();
        wCode = b.substring(j + 15).toInt();
        ok = true;
      }
    }
    http.end();
  }
  weatherOk = weatherOk || ok;
  nextWeather = millis() + (ok ? 900000UL : 60000UL);   // refresh every 15 min, retry after 1 min
  lastSec = -2;
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

void drawSonar() {                                 // idle page: what the front sensor is measuring
  unsigned long now = millis();
  bool valid = frontCm < CM_VALID_MAX;
  cv.fillScreen(C565(4, 12, 20));
  cv.setTextSize(1);
  cv.setTextColor(C565(120, 200, 255));
  cv.setCursor(8, 4);
  cv.print("SONAR  front distance");

  char nb[12];
  if (valid) snprintf(nb, sizeof nb, "%d", frontCm); else strcpy(nb, "--");
  uint16_t col = !valid ? C565(150, 150, 150) : frontCm < STOP_CM ? C565(255, 80, 80)
               : frontCm < 60 ? C565(255, 210, 60) : C565(90, 255, 140);
  int dw = strlen(nb) * 24;
  int x0 = (160 - (dw + 4 + 24)) / 2;
  cv.setTextColor(col);
  cv.setTextSize(4); cv.setCursor(x0, 16); cv.print(nb);
  cv.setTextSize(2); cv.setCursor(x0 + dw + 4, 32); cv.print("cm");

  // bar 0-200 cm: red tick = stop distance, cyan triangle = home distance
  const int bx = 8, bw = 144, by = 56, bh = 10;
  cv.drawRoundRect(bx - 1, by - 1, bw + 2, bh + 2, 3, C565(90, 110, 130));
  if (valid) cv.fillRect(bx, by, frontCm * bw / CM_VALID_MAX, bh, col);
  cv.drawFastVLine(bx + STOP_CM * bw / CM_VALID_MAX, by - 3, bh + 6, C565(255, 80, 80));
  if (homeCm > 0) {
    int hx = bx + homeCm * bw / CM_VALID_MAX;
    cv.fillTriangle(hx, by + bh + 2, hx - 4, by + bh + 8, hx + 4, by + bh + 8, C565(80, 220, 255));
  }

  char line[48];
  if (homeCm > 0 && valid) snprintf(line, sizeof line, "home %d  drift %+d  max %d", homeCm, frontCm - homeCm, RADIUS_CM);
  else if (homeCm > 0)     snprintf(line, sizeof line, "home %d  (no echo now)", homeCm);
  else                     snprintf(line, sizeof line, "home: no object in range");
  cv.setTextSize(1);
  cv.setTextColor(WHT);
  cv.setCursor(8, 78);
  cv.print(line);

  // graph of the last scans
  const int gx = 8, gy = 90, gw = 144, gh = 20;
  cv.drawRect(gx - 1, gy - 1, gw + 2, gh + 2, C565(60, 80, 100));
  int n = min(histCount, HIST), prevX = 0, prevY = 0;
  for (int i = 0; i < n; i++) {
    int idx = (histPos - n + i + HIST) % HIST;     // oldest -> newest
    int px = gx + i * (gw - 1) / (HIST - 1);
    int py = gy + gh - 1 - hist[idx] * (gh - 1) / CM_VALID_MAX;
    if (i > 0) cv.drawLine(prevX, prevY, px, py, C565(90, 255, 140));
    cv.fillCircle(px, py, 1, WHT);
    prevX = px; prevY = py;
  }

  char sl[48];
  if (ws == W_WAIT) {
    long left = (long)(nextWander - now) / 1000 + 1;
    if (left < 0) left = 0;
    snprintf(sl, sizeof sl, "holding - next move %lds", left);
  } else snprintf(sl, sizeof sl, "%s %s", stateName(), lastMove);
  cv.setTextColor(ws == W_WAIT ? C565(150, 200, 255) : C565(255, 210, 60));
  cv.setCursor(8, 116);
  cv.print(sl);
  push();
}

void nextPage() {                                  // clock/weather -> random emoji -> sonar -> ...
  idlePage = (idlePage + 1) % 3;
  pageChanged = millis();
  if (idlePage == 1) {
    int t;
    do { t = esp_random() % NUM_EMOJI; } while (t == emojiType);   // never the same emoji twice in a row
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
  homeCm = 0;                                      // the first scan after this becomes the new home distance
  devCount = 0;
  newWallpaper();
}

// ================= motors =================
void drive(int left, int right) {                  // 1 forward, -1 reverse, 0 stop; M1+M2 = left, M3+M4 = right
  int dirs[4] = {left, left, right, right};
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

// ================= obstacle sensor + idle patrol =================
// Echo is timed by a pin interrupt (not pulseIn) so Wi-Fi / audio-task pauses cannot stretch the measurement.
volatile unsigned long echoRise = 0, echoWidth = 0;
volatile bool echoDone = false;
void IRAM_ATTR echoISR() {
  unsigned long t = micros();
  if (gpio_get_level((gpio_num_t)ECHO_PIN)) echoRise = t;
  else { echoWidth = t - echoRise; echoDone = true; }
}

int readCm() {                                     // HC-SR04 distance in cm; 999 = nothing in range (or no sensor)
  echoDone = false;
  echoWidth = 0;
  digitalWrite(TRIG_PIN, LOW);  delayMicroseconds(4);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  unsigned long t0 = micros();
  while (!echoDone && micros() - t0 < 15000) delayMicroseconds(50);   // ~2.5 m max
  if (!echoDone) return 999;
  unsigned long us = echoWidth;
  if (us < 120 || us > 12500) return 999;          // under ~2 cm or over ~2 m = invalid
  return (int)(us / 58);
}

int readCmMedian(int n = 5, int gapMs = 30) {      // n pings (odd), median = ignores bad readings
  int v[9];
  if (n > 9) n = 9;
  for (int i = 0; i < n; i++) { v[i] = readCm(); delay(gapMs); }   // the gap lets the previous echo die out
  for (int i = 1; i < n; i++) {                    // insertion sort
    int k = v[i], j = i - 1;
    while (j >= 0 && v[j] > k) { v[j + 1] = v[j]; j--; }
    v[j + 1] = k;
  }
  return v[n / 2];
}

void updateFront(int cm, unsigned long now, bool track = true) {   // track=false: display only, do not touch the home distance      // store a scan, keep the home distance, print it for the Serial Monitor
  frontCm = cm;
  scanAt = now;
  hist[histPos] = (uint8_t)(cm < CM_VALID_MAX ? cm : CM_VALID_MAX);
  histPos = (histPos + 1) % HIST;
  if (histCount < HIST) histCount++;
  if (track && cm < CM_VALID_MAX) {
    if (homeCm == 0) homeCm = cm;                  // first reading after idle begins = home
    else if (abs(cm - homeCm) > 60) {              // something far away changed: re-home after 2 scans in a row
      if (++devCount >= 2) { homeCm = cm; devCount = 0; }
    } else devCount = 0;
  }
  Serial.printf("[sonar] front=%d cm  home=%d cm  drift=%d  state=%s %s\n",
                cm < CM_VALID_MAX ? cm : -1, homeCm,
                (homeCm > 0 && cm < CM_VALID_MAX) ? cm - homeCm : 0, stateName(), lastMove);
}

void sonarScan(unsigned long now) {                // every 3 s while idle and standing still
  if (mode != MODE_IDLE || ws != W_WAIT || moving) return;
  bool live = (idlePage == 2);                     // sonar page on screen: fast live readings (they never change "home")
  if (now - scanAt < (live ? 300UL : SCAN_EVERY_MS)) return;
  updateFront(live ? readCmMedian(3, 25) : readCmMedian(), now, !live);
}

void driveMove(int kind, bool undo) {              // undo = the exact opposite move
  int sg = undo ? -1 : 1;
  switch (kind) {
    case 0:  drive(sg, sg);   break;               // forward   (undo = backward)
    case 1:  drive(-sg, -sg); break;               // backward  (undo = forward)
    case 2:  drive(-sg, sg);  break;               // left      (undo = right)
    default: drive(sg, -sg);  break;               // right     (undo = left)
  }
}

bool movesForward(int kind, bool undo) { return (kind == 0 && !undo) || (kind == 1 && undo); }

const char* kindName(int kind) {
  switch (kind) {
    case 0:  return "FORWARD";
    case 1:  return "BACKWARD";
    case 2:  return "LEFT";
    default: return "RIGHT";
  }
}

void wanderStep(unsigned long now) {
  if (moving || mode != MODE_IDLE) {               // a voice command or a face is active: the patrol yields
    if (ws != W_WAIT && !moving) drive(0, 0);
    ws = W_WAIT;
    nextWander = now + WANDER_EVERY_MS;
    return;
  }
  switch (ws) {
    case W_WAIT: {
      if ((long)(now - nextWander) < 0) break;
      nextWander = now + WANDER_EVERY_MS;          // slots are exactly 5 s apart
      int cm = readCmMedian();
      updateFront(cm, now);
      int drift = (homeCm > 0 && cm < CM_VALID_MAX) ? cm - homeCm : 0;
      if (abs(drift) > RADIUS_CM && abs(drift) <= 60) {   // drifted too far: drive back to the home distance
        corrDir = (drift > 0) ? 1 : -1;            // too far from the object -> forward, too close -> backward
        drive(corrDir, corrDir);
        lastMove = corrDir > 0 ? "FWD" : "BACK";
        wsStart = now; wsDur = 1500; ws = W_CORR;
        break;
      }
      int kind = patternIdx;
      patternIdx = (patternIdx + 1) % 4;
      if (kind == 0 && cm < STOP_CM + 5) kind = 1; // too close to go forward: back off instead
      moveKind = kind;
      driveMove(kind, false);
      lastMove = kindName(kind);
      wsStart = now; wsDur = MOVE_MS; ws = W_OUT;
      break;
    }
    case W_OUT: {
      bool blocked = false;
      if (movesForward(moveKind, false) && now - lastDist >= 60) { lastDist = now; blocked = readCm() < STOP_CM; }
      if (blocked || now - wsStart >= wsDur) {
        outDur = now - wsStart;
        drive(0, 0);
        if (outDur < 80) ws = W_WAIT;
        else { wsStart = now; wsDur = 150; ws = W_PAUSE; }
      }
      break;
    }
    case W_PAUSE:
      if (now - wsStart >= wsDur) {
        driveMove(moveKind, true);                 // undo the move: back where it started
        wsStart = now; wsDur = outDur; ws = W_BACK;
      }
      break;
    case W_BACK: {
      bool blocked = false;
      if (movesForward(moveKind, true) && now - lastDist >= 60) { lastDist = now; blocked = readCm() < STOP_CM; }
      if (blocked || now - wsStart >= wsDur) { drive(0, 0); ws = W_WAIT; }
      break;
    }
    case W_CORR: {
      bool done = false;
      if (now - lastDist >= 60) {
        lastDist = now;
        int cm = readCm();
        frontCm = cm;                              // keep the sonar page live while correcting
        if (cm >= CM_VALID_MAX || abs(cm - homeCm) <= 3) done = true;
        if (corrDir > 0 && cm < STOP_CM) done = true;
      }
      if (done || now - wsStart >= wsDur) { drive(0, 0); ws = W_WAIT; }
      break;
    }
  }
}

// ================= HTTP handlers =================
void handleCmd() {                                 // /cmd?c=forward&ms=1500
  String c = server.arg("c");
  long ms = server.hasArg("ms") ? server.arg("ms").toInt() : 1000;
  ms = constrain(ms, 100, 5000);
  if (c == "forward")       drive(1, 1);
  else if (c == "backward") drive(-1, -1);
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
  face = server.arg("s");
  if (face == "") face = "neutral";
  talking = (server.arg("talk") == "1");
  mode = MODE_FACE;
  lastInteract = millis();
  server.send(200, "text/plain", "ok");
}

void handleIdle() {                                // /idle
  startIdle();
  server.send(200, "text/plain", "ok");
}

void handleStatus() {                              // /status  -> what the front sensor is measuring, as JSON
  int drift = (homeCm > 0 && frontCm < CM_VALID_MAX) ? frontCm - homeCm : 0;
  String j = String("{\"front_cm\":") + String(frontCm < CM_VALID_MAX ? frontCm : -1) +
             ",\"home_cm\":" + String(homeCm) + ",\"drift_cm\":" + String(drift) +
             ",\"state\":\"" + stateName() + "\",\"last_move\":\"" + lastMove +
             "\",\"mode\":\"" + (mode == MODE_IDLE ? "idle" : "active") +
             "\",\"scan_age_ms\":" + String((unsigned long)(millis() - scanAt)) + "}";
  server.send(200, "application/json", j);
}

// ================= audio: analog sound-sensor mic + HW-104 amp, streamed over TCP =================
// The laptop connects to port 5005.
//   ESP32 -> laptop : raw mic audio   (16 kHz, 16-bit, mono)
//   laptop -> ESP32 : raw speaker audio (16 kHz, 16-bit, mono)
// Wiring:  Analog sound sensor  AO->D34  DO->D35  VCC->3.3V  GND->GND
//          Speaker via the HW-104 (PAM8403) amp, which needs an analog signal:
//            D22 -> 1k resistor -> node;  node -> 22nF capacitor -> GND;  node -> 1uF capacitor -> amp "L" pad
//            amp: "L" ground pad -> GND, "5V +" -> 5V, "5V -" -> GND, speaker on "L OUT" + and -
// D19 and D21 are NOT used by audio (the HC-SR04 sonar uses them).
// The mic is read with the legacy ADC driver (adc1_get_raw) so it does not conflict with the legacy I2S driver.
#define I2S_PORT  I2S_NUM_0
#define I2S_DOUT  22      // speaker bitstream out (through the RC filter to the amp)
#define MIC_AO    34      // analog sound sensor: AO (= ADC1_CHANNEL_6)
#define MIC_DO    35      // analog sound sensor: DO (not used for streaming)
const int  AUDIO_RATE    = 16000;
const int  FRAMES        = 256;       // 16 ms per block
const float MIC_GAIN     = 2.0;       // louder = bigger number (try 1 to 8). Was 8.0, too hot for this module
const int  SPK_VOLUME    = 13;        // 5% PCM amplitude before PDM output; keep samples within int16 range.
const int  PREFILL       = 2000;      // samples buffered before playback starts (125 ms)
const int  RING          = 8192;      // 0.5 s speaker buffer

WiFiServer audioServer(5005);
WiFiClient audioClient;
int16_t ring[RING];
int rHead = 0, rTail = 0, rCount = 0;

// Speaker without an I2S amp: every audio sample becomes 64 bits of pulse-density data (1st-order sigma-delta).
// One audio frame is exactly 64 I2S clock bits, so D22 carries a 1.024 MHz bitstream. The RC filter turns it back into audio.
static uint32_t sdAcc = 0;
// g = gate gain 0..1: at 1 the stream is normal (silence = 50% density); at 0 the output is a flat 0 V, so there is no
// 512 kHz carrier for the amp to turn into hiss. g is ramped slowly so opening / closing the gate makes no click.
static void sigmaDelta(int16_t smp, uint32_t* w, float g = 1.0f) {
  uint32_t level = (uint32_t)(((float)((int32_t)smp + 32768)) * g);   // 0..65535; silence = 32768 = 50% density
  uint32_t a = sdAcc;
  for (int k = 0; k < 2; k++) {
    uint32_t word = 0;
    for (int b = 31; b >= 0; b--) {
      a += level;
      if (a >= 65536) { a -= 65536; word |= (1u << b); }
    }
    w[k] = word;
  }
  sdAcc = a;
}

void i2sSetup() {                                  // speaker only: no clock pins, so D19 / D21 stay free for the sonar
  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX);
  cfg.sample_rate = AUDIO_RATE;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT;
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  cfg.dma_buf_count = 6;
  cfg.dma_buf_len = FRAMES;
  cfg.use_apll = false;
  cfg.tx_desc_auto_clear = false;     // on an underrun repeat the last block (zeros would be a DC step = a tick)

  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = I2S_PIN_NO_CHANGE;   // D19 stays free for the sonar
  pins.ws_io_num = I2S_PIN_NO_CHANGE;    // D21 stays free for the sonar
  pins.data_out_num = I2S_DOUT;
  pins.data_in_num = I2S_PIN_NO_CHANGE;

  i2s_driver_install(I2S_PORT, &cfg, 0, NULL);
  i2s_set_pin(I2S_PORT, &pins);
  static int32_t quiet[FRAMES * 2];                  // fill the DMA with the steady "silence" stream: click-free start
  for (int i = 0; i < FRAMES; i++) sigmaDelta(0, (uint32_t*)&quiet[2 * i], 0.0f);   // start with the gate closed: flat 0 V
  for (int k = 0; k < 6; k++) { size_t bw = 0; i2s_write(I2S_PORT, quiet, sizeof(quiet), &bw, 100 / portTICK_PERIOD_MS); }
}

void audioTask(void*) {
  static int32_t out[FRAMES * 2];
  static int16_t mono[FRAMES];
  static uint8_t net[1024];
  static float dc = 2048;
  bool playing = false, hasPend = false;
  uint8_t pend = 0;
  unsigned long muteUntil = 0, lastNetMs = 0, lastDbg = 0, lastPlayMs = 0;
  int peak = 0;
  float gate = 0.0f;                  // speaker gate: closed (0) while nothing plays, so the amp stays silent

  // Calibrate the DC offset from the real sensor idle level (200 samples, ~0.2 s) so the first
  // readings are not a huge false swing.
  { long s = 0; for (int i = 0; i < 200; i++) { s += adc1_get_raw(ADC1_CHANNEL_6); delay(1); } dc = s / 200.0f; }

  for (;;) {
    // newest laptop connection wins
    WiFiClient c = audioServer.available();
    if (c) {
      if (audioClient) audioClient.stop();
      audioClient = c;
      audioClient.setNoDelay(true);
      rHead = rTail = rCount = 0;
      playing = false; hasPend = false;
      Serial.println("[audio] laptop connected");
    }
    bool connected = audioClient && audioClient.connected();

    // 1) laptop -> speaker ring buffer
    if (connected) {
      int avail = audioClient.available();
      while (avail > 0 && rCount < RING - 600) {
        int n = min(min(avail, (int)sizeof(net)), (RING - rCount - 1) * 2);
        if (n <= 0) break;
        n = audioClient.read(net, n);
        if (n <= 0) break;
        lastNetMs = millis();
        for (int i = 0; i < n; i++) {
          if (hasPend) {
            int32_t smp = (int16_t)(pend | (net[i] << 8));
            ring[rHead] = (int16_t)((smp * SPK_VOLUME) >> 8);
            rHead = (rHead + 1) % RING;
            rCount++;
            hasPend = false;
          } else { pend = net[i]; hasPend = true; }
        }
        avail = audioClient.available();
      }
    }

    // 2) sample the analog mic: 256 samples at 16 kHz (this also paces the loop at 16 ms)
    unsigned long t0 = micros();
    for (int i = 0; i < FRAMES; i++) {
      while (micros() - t0 < (i * 625UL) / 10) taskYIELD();   // 62.5 us per sample = 16 kHz
      int v = adc1_get_raw(ADC1_CHANNEL_6);        // GPIO34
      dc += 0.002f * (v - dc);                     // remove the DC offset of the sensor
      float f = (v - dc) * MIC_GAIN * 16.0f;       // 12-bit -> 16-bit range, with gain
      if (f > 32767) f = 32767;
      if (f < -32768) f = -32768;
      mono[i] = (int16_t)f;
      int a = abs((int)f);
      if (a > peak) peak = a;
    }
    int frames = FRAMES;

    // 3) speaker: write the same number of frames
    if (!playing && rCount > 0 && (rCount >= PREFILL || millis() - lastNetMs > 150)) playing = true;
    if (playing && rCount == 0) { playing = false; muteUntil = millis() + 400; }
    if (playing) lastPlayMs = millis();
    float gateTarget = (playing || rCount > 0 || millis() - lastPlayMs < 300) ? 1.0f : 0.0f;
    for (int i = 0; i < frames; i++) {
      int16_t smp = 0;                    // 0 = silence
      if (playing && rCount > 0) { smp = ring[rTail]; rTail = (rTail + 1) % RING; rCount--; }
      if (gate < gateTarget) { gate += 1.0f / 1600; if (gate > 1.0f) gate = 1.0f; }       // open over ~100 ms
      else if (gate > gateTarget) { gate -= 1.0f / 3200; if (gate < 0.0f) gate = 0.0f; } // close over ~200 ms
      sigmaDelta(smp, (uint32_t*)&out[2 * i], gate);
    }
    size_t bw = 0;
    i2s_write(I2S_PORT, out, frames * 8, &bw, 100 / portTICK_PERIOD_MS);

    // 4) mic -> laptop (muted while the robot talks, so it never hears itself)
    if (connected && !playing && millis() > muteUntil) {
      audioClient.write((uint8_t*)mono, frames * 2);
    }

    if (millis() - lastDbg > 2000) {
      Serial.printf("[audio] mic peak=%d playing=%d laptop=%d gate=%.1f heap=%u\n",
                    peak, (int)playing, (int)connected, gate, (unsigned)ESP.getFreeHeap());
      peak = 0;
      lastDbg = millis();
    }
  }
}

// ================= setup / loop =================
void setup() {
  Serial.begin(115200);
  pinMode(I2S_DOUT, OUTPUT);                       // hold the amp input at 0 V until the audio starts (floating = noise)
  digitalWrite(I2S_DOUT, LOW);

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

  SPI.begin(18, -1, 23, TFT_CS);                   // SCK, no MISO (keeps D19 free for the sonar TRIG), MOSI, CS
  tft.initR(INITR_BLACKTAB);                       // try INITR_GREENTAB or INITR_REDTAB if colours/edges look off
  tft.setRotation(3);                              // landscape 160 x 128, flipped 180 degrees
  pinMode(TRIG_PIN, OUTPUT);                       // re-claim the sonar pins in case the SPI init touched them
  digitalWrite(TRIG_PIN, LOW);
  pinMode(ECHO_PIN, INPUT);
  attachInterrupt(digitalPinToInterrupt(ECHO_PIN), echoISR, CHANGE);
  splash("Hello!", "Connecting Wi-Fi...");

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(300); Serial.print("."); }
  Serial.print("\nESP32 IP: ");
  Serial.println(WiFi.localIP());
  splash("Connected", WiFi.localIP().toString().c_str());   // put this IP in the laptop's .env
  delay(3000);

  configTime(GMT_OFFSET_SEC, 0, "pool.ntp.org", "time.google.com");

  WiFi.setSleep(false);                              // no Wi-Fi power saving: keeps audio smooth
  adc1_config_width(ADC_WIDTH_BIT_12);
  adc1_config_channel_atten(ADC1_CHANNEL_6, ADC_ATTEN_DB_11);   // ADC1_CHANNEL_6 = GPIO34 (mic AO)
  pinMode(MIC_DO, INPUT);
  i2sSetup();
  audioServer.begin();
  xTaskCreatePinnedToCore(audioTask, "audio", 8192, NULL, 1, NULL, 1);   // priority 1 = shares CPU with loop()

  server.on("/cmd", handleCmd);
  server.on("/face", handleFace);
  server.on("/idle", handleIdle);
  server.on("/status", handleStatus);
  server.begin();

  startIdle();
  nextWander = millis() + WANDER_EVERY_MS;
}

void loop() {
  server.handleClient();
  unsigned long now = millis();

  if (moving && (long)(now - stopAt) >= 0) {       // auto-stop safety
    drive(0, 0);
    moving = false;
  }

  if (moving && movingForward && STOP_FOR_OBSTACLE_ON_VOICE && now - lastVoiceDist >= 60) {
    lastVoiceDist = now;
    if (readCm() < STOP_CM) { drive(0, 0); moving = false; movingForward = false; }   // obstacle: stop early
  }

  wanderStep(now);
  sonarScan(now);

  if (mode == MODE_FACE && now - lastInteract > IDLE_AFTER_MS) startIdle();

  if (mode == MODE_FACE) {
    static unsigned long lastFrame = 0;
    if (now - lastFrame >= 80) { lastFrame = now; drawFace(); }
  } else {
    unsigned long pageMs = (idlePage == 0) ? INFO_MS : (idlePage == 1) ? EMOJI_MS : SONAR_MS;
    if (now - pageChanged >= pageMs) nextPage();
    if (idlePage == 1) {
      static unsigned long lastEmoji = 0;
      if (now - lastEmoji >= 60) { lastEmoji = now; drawEmoji(emojiType); }
    } else if (idlePage == 2) {
      static unsigned long lastSonar = 0;
      if (now - lastSonar >= 150) { lastSonar = now; drawSonar(); }
    } else {
      struct tm t;
      bool haveTime = getLocalTime(&t, 0);
      int sec = haveTime ? t.tm_sec : -1;
      if (sec != lastSec) { lastSec = sec; renderIdle(haveTime, t); }
    }
  }

  if (mode == MODE_IDLE && idlePage == 0 && !moving && ws == W_WAIT && WiFi.status() == WL_CONNECTED && now >= nextWeather) fetchWeather();   // only when idle, never while driving or showing a face
}


# Code for esp32 cam module taking pictures and sending on tft via esp32 devkit
camera


#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include <TJpg_Decoder.h>

// ================= WIFI & CAMERA =================
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

String CAM_IP = "192.168.1.9";
const uint16_t CAM_PORT = 80;
const char* CAM_PATH = "/capture";

const unsigned long SHOT_MS = 5000;
const bool SCREEN_FLASH = true;

// Image settings
#define SWAP_BYTES 1
#define JPEG_SWAP 0

// ================= TFT PINS =================
#define TFT_CS  5
#define TFT_DC  2
#define TFT_RST 15

// ================= FRAME SETTINGS =================
const int CAM_W = 160;
const int CAM_H = 120;

const size_t FRAME_BYTES = CAM_W * CAM_H * 2;
const size_t BUF_SIZE = 40000;

Adafruit_ST7735 tft(TFT_CS, TFT_DC, TFT_RST);

uint8_t* frame = nullptr;

unsigned long lastShot = 0;
int shotNo = 0;
int failCount = 0;

enum PicResult {
  PIC_FAIL = 0,
  PIC_RAW = 1,
  PIC_JPEG = 2
};

// ================= SCREEN MESSAGE =================
void message(const char* l1, const char* l2) {
  tft.fillScreen(ST77XX_BLACK);

  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(2);
  tft.setCursor(8, 40);
  tft.print(l1);

  tft.setTextSize(1);
  tft.setCursor(8, 70);
  tft.print(l2);
}

// ================= JPEG CALLBACK =================
bool tftOutput(int16_t x, int16_t y,
               uint16_t w, uint16_t h,
               uint16_t* bitmap) {

  if (y >= tft.height()) return false;

  tft.drawRGBBitmap(x, y, bitmap, w, h);

  return true;
}

// ================= WIFI =================
bool connectWiFi(unsigned long timeoutMs) {

  if (WiFi.status() == WL_CONNECTED)
    return true;

  WiFi.disconnect();
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);

  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long t0 = millis();

  while (WiFi.status() != WL_CONNECTED &&
         millis() - t0 < timeoutMs) {

    delay(300);
    Serial.print(".");
  }

  Serial.println();

  return WiFi.status() == WL_CONNECTED;
}

// ================= NETWORK TEST =================
bool tcpTest() {

  WiFiClient c;

  bool ok = c.connect(
    CAM_IP.c_str(),
    CAM_PORT,
    4000
  );

  Serial.printf(
    "TCP test %s:%u -> %s\n",
    CAM_IP.c_str(),
    CAM_PORT,
    ok ? "OK" : "FAIL"
  );

  c.stop();

  return ok;
}

// ================= FETCH CAMERA IMAGE =================
PicResult fetchFrame(size_t &len) {

  len = 0;

  HTTPClient http;

  http.setConnectTimeout(8000);
  http.setTimeout(8000);
  http.setReuse(false);

  String url =
    "http://" + CAM_IP +
    ":" + String(CAM_PORT) + CAM_PATH;

  if (!http.begin(url)) {
    Serial.println("HTTP begin failed");
    return PIC_FAIL;
  }

  int code = http.GET();

  if (code != 200) {

    Serial.printf("HTTP error: %d\n", code);

    http.end();

    return PIC_FAIL;
  }

  int size = http.getSize();

  if (size <= 0 || size > BUF_SIZE) {

    Serial.printf("Invalid image size: %d\n", size);

    http.end();

    return PIC_FAIL;
  }

  WiFiClient* stream = http.getStreamPtr();

  size_t got = 0;

  unsigned long t0 = millis();

  while (got < (size_t)size &&
         millis() - t0 < 8000) {

    size_t avail = stream->available();

    if (avail > 0) {

      size_t n = min(
        avail,
        (size_t)size - got
      );

      got += stream->readBytes(
        frame + got,
        n
      );

    } else if (!stream->connected()) {

      break;

    } else {

      delay(1);
    }
  }

  http.end();

  len = got;

  if (got != (size_t)size) {

    Serial.printf(
      "Incomplete download: %u / %d\n",
      (unsigned)got,
      size
    );

    return PIC_FAIL;
  }

  Serial.printf(
    "Downloaded image: %u bytes\n",
    (unsigned)len
  );

  // RAW RGB565
  if (len == FRAME_BYTES)
    return PIC_RAW;

  // JPEG
  if (len > 2 &&
      frame[0] == 0xFF &&
      frame[1] == 0xD8)
    return PIC_JPEG;

  Serial.println("Unknown image format");

  for (int i = 0; i < 8 && i < (int)len; i++) {
    Serial.printf("%02X ", frame[i]);
  }

  Serial.println();

  return PIC_FAIL;
}

// ================= SHOT NUMBER =================
void drawShotNumber() {

  tft.setTextSize(1);
  tft.setTextColor(
    ST77XX_WHITE,
    ST77XX_BLACK
  );

  tft.setCursor(2, 118);
  tft.printf("#%d", shotNo);
}

// ================= DISPLAY RAW IMAGE =================
void showRaw() {

  uint16_t* px = (uint16_t*)frame;

#if SWAP_BYTES
  for (size_t i = 0; i < FRAME_BYTES / 2; i++) {

    px[i] = (px[i] >> 8) |
            (px[i] << 8);
  }
#endif

  tft.fillScreen(ST77XX_BLACK);

  tft.drawRGBBitmap(
    0, 4,
    px,
    CAM_W,
    CAM_H
  );

  drawShotNumber();
}

// ================= DISPLAY JPEG IMAGE =================
bool showJpeg(size_t len) {

  uint16_t w = 0;
  uint16_t h = 0;

  if (TJpgDec.getJpgSize(
        &w, &h,
        frame,
        len
      ) != 0) {

    Serial.println("JPEG header error");

    return false;
  }

  uint8_t scale = 1;

  while (scale < 8 &&
         (w / scale > 160 ||
          h / scale > 128)) {

    scale *= 2;
  }

  TJpgDec.setJpgScale(scale);

  Serial.printf(
    "JPEG: %ux%u, scale 1/%u\n",
    w, h, scale
  );

  tft.fillScreen(ST77XX_BLACK);

  int ox = (160 - w / scale) / 2;
  int oy = (128 - h / scale) / 2;

  if (ox < 0) ox = 0;
  if (oy < 0) oy = 0;

  TJpgDec.drawJpg(
    ox,
    oy,
    frame,
    len
  );

  drawShotNumber();

  return true;
}

// ================= TAKE PICTURE =================
void takePicture() {

  if (!connectWiFi(10000)) {

    Serial.println("WiFi disconnected");

    message("No WiFi", "Reconnecting...");

    return;
  }

  if (SCREEN_FLASH) {
    tft.fillScreen(ST77XX_WHITE);
  }

  unsigned long t0 = millis();

  size_t len = 0;

  PicResult result = fetchFrame(len);

  bool ok = false;

  if (result == PIC_RAW) {

    shotNo++;

    showRaw();

    ok = true;

  } else if (result == PIC_JPEG) {

    shotNo++;

    ok = showJpeg(len);

    if (!ok) shotNo--;
  }

  Serial.printf(
    "Shot %d: %s in %lu ms\n",
    shotNo,
    ok ? "SUCCESS" : "FAILED",
    millis() - t0
  );

  if (ok) {

    failCount = 0;

  } else {

    failCount++;

    message(
      "Camera?",
      "Check Serial Monitor"
    );

    if (failCount % 3 == 0) {

      Serial.printf(
        "ESP32 IP: %s\n",
        WiFi.localIP().toString().c_str()
      );

      tcpTest();
    }
  }
}

// ================= SETUP =================
void setup() {

  Serial.begin(115200);

  delay(300);

  tft.initR(INITR_BLACKTAB);
  tft.setRotation(3);

  message("Hello!", "Connecting WiFi...");

  frame = (uint8_t*)malloc(BUF_SIZE);

  if (!frame) {

    message("No memory", "Buffer failed");

    while (true) delay(1000);
  }

  // Initialize JPEG decoder
  TJpgDec.setJpgScale(1);
  TJpgDec.setSwapBytes(JPEG_SWAP);
  TJpgDec.setCallback(tftOutput);

  Serial.println("TJpg_Decoder initialized");
  Serial.println("JPEG support enabled");

  while (!connectWiFi(15000)) {

    Serial.println("WiFi failed, retrying...");

    message("WiFi fail", "Check credentials");
  }

  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());

  Serial.print("Gateway: ");
  Serial.println(WiFi.gatewayIP());

  Serial.printf(
    "Camera: %s:%u%s\n",
    CAM_IP.c_str(),
    CAM_PORT,
    CAM_PATH
  );

  bool reachable = tcpTest();

  message(
    reachable ? "Connected" : "Cam not found",
    reachable ? "First photo soon" : "Check camera IP"
  );

  delay(1000);

  lastShot = millis() - SHOT_MS + 500;
}

// ================= LOOP =================
void loop() {

  if (millis() - lastShot >= SHOT_MS) {

    lastShot = millis();

    takePicture();
  }
}

---

# Integrated robot operation

The main firmware is `esp32_robot/src/robot_server.ino`. The ESP32 owns the ST7735 TFT,
HC-SR04 sensor, microphone, speaker, dashboard, photo capture, and live-preview timing.
The backend owns local speech recognition, Gemini conversation/intent, and ElevenLabs
speech synthesis. It connects to the ESP32's TCP audio server on port 5005.

1. Copy `env.example` to `.env` and set `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`,
   `ELEVEN_VOICE_ID`, and `ESP32_IP`. `PREVIEW_DURATION_MS` defaults to 10000.
2. Copy `esp32_robot/src/robot_secrets.example.h` to
   `esp32_robot/src/robot_secrets.h` and set `WIFI_SSID` and `WIFI_PASS` there.
   The local secrets header is ignored by `.gitignore`. Set `CAMERA_IP` in the firmware.
   The camera must expose the existing HTTP `GET /capture` endpoint and return a JPEG
   (up to 40000 bytes) or 160x120 RGB565 frame.
3. Install backend dependencies:

   ```bash
   python3 -m pip install -r requirements.txt
   ```

4. Start the backend:

   ```bash
   python3 app.py
   ```

5. Upload the firmware with `cd esp32_robot && pio run --target upload`. The ESP32
   connects to Wi-Fi, starts its audio server and sensor acquisition, and the backend
   speaks the fixed greeting once when the audio connection is established.
6. Obstacle monitoring uses a 200 ms sensor task and a median of up to three valid
   returns. The obstacle page stays visible for ten seconds and redraws with the latest
   measurement every five seconds. The clock/weather page stays visible for ten seconds;
   at startup, the dashboard is held for its first ten seconds while the greeting plays.
   Weather data refresh is not limited to when that page is visible.
7. Voice photo requests fetch one frame from the camera and display it for five seconds.
   Live preview uses `/preview?duration_ms=...`, fetches successive real frames about
   once per second, retries transient fetch failures while keeping the last frame visible,
   and restores the previous face/dashboard after its configured duration. Automatic
   preview also displays live frames for five seconds every ten seconds, including while
   a face is active. The firmware retries camera availability checks every ten seconds.

## Confirmed hardware in the test sketches

- Main ESP32 TFT: ST7735-compatible 160x128, CS=D5, DC=D2, RST=D15,
  SCK=D18, MOSI=D23, rotation 3.
- Analog microphone: AO=D34, ADC1, with legacy ADC reading.
- Speaker output: D22 through the RC filter/PAM8403 signal path.
- Sonar: TRIG=D19 and ECHO=D21. The HC-SR04 ECHO pin is 5 V; use the documented 1k/2k
  divider before connecting it to the ESP32.
- Camera image consumer: D5/D2/D15 TFT, HTTP `/capture` endpoint, 160x120 RGB565 or JPEG.
- AI-Thinker ESP32-CAM onboard camera: PWDN=GPIO32, XCLK=GPIO0, SIOD/SIOC=GPIO26/27,
  camera data Y2-Y9=GPIO5/18/19/21/36/39/34/35, VSYNC=GPIO25, HREF=GPIO23,
  PCLK=GPIO22. These are the module's onboard OV2640 connections; the two ESP32 boards
  exchange frames over Wi-Fi HTTP and need no direct data wiring.

The connected AI-Thinker ESP32-CAM already runs a camera server. Its serial log reported
`192.168.1.10`, and `GET /capture` was verified to return a JPEG. The DevKit is configured
to fetch from that address and render the image on its own TFT. Reserve `192.168.1.10`
for the camera in the router so its address remains stable. Check the endpoint with
`curl --fail --output /dev/null http://192.168.1.10/capture`. Both boards must use the
same 2.4 GHz Wi-Fi network.

`esp32_cam/src/camera_server.ino` is a recovery server if the camera firmware is ever
replaced; it is not needed while the existing server is working. Do not flash it over
the current camera firmware unless recovery is required.

## Feature checks

- View the `OBSTACLE MONITOR` dashboard page with objects at several
  measured distances; verify the sensor wiring and 5 V echo divider first.
- Confirm the fixed greeting is spoken once on backend/ESP32 audio connection, then speak
  multiple questions and verify the backend returns to listening after TTS completes.
- Say "click picture" or "take a photo" and verify one captured frame is shown for five
  seconds; these direct photo commands are handled locally without Gemini.
- Ask "show live camera" and verify changing camera frames for ten seconds; leave the
  robot idle to verify the random preview. Both checks require the ESP32-CAM endpoint.
- Verify the camera board's `/health` returns `ok` and its `/capture` returns
  `image/jpeg` before testing camera actions from the DevKit. The DevKit returns
  `503` when its background camera check cannot reach the camera board. Do not treat a
  successful firmware build as a successful camera hardware test.
