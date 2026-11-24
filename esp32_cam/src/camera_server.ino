#include <Arduino.h>
#include <WiFi.h>
#include "esp_camera.h"
#include "esp_http_server.h"

#include "../../esp32_robot/src/robot_secrets.h"

#define PWDN_GPIO_NUM 32
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM 0
#define SIOD_GPIO_NUM 26
#define SIOC_GPIO_NUM 27
#define Y9_GPIO_NUM 35
#define Y8_GPIO_NUM 34
#define Y7_GPIO_NUM 39
#define Y6_GPIO_NUM 36
#define Y5_GPIO_NUM 21
#define Y4_GPIO_NUM 19
#define Y3_GPIO_NUM 18
#define Y2_GPIO_NUM 5
#define VSYNC_GPIO_NUM 25
#define HREF_GPIO_NUM 23
#define PCLK_GPIO_NUM 22

static httpd_handle_t cameraServer = nullptr;
static bool cameraReady = false;
static unsigned long nextServerStartAttempt = 0;

static esp_err_t healthHandler(httpd_req_t* request) {
  httpd_resp_set_type(request, "text/plain");
  if (!cameraReady) {
    httpd_resp_set_status(request, "503 Service Unavailable");
    return httpd_resp_send(request, "camera unavailable", HTTPD_RESP_USE_STRLEN);
  }
  return httpd_resp_send(request, "ok", HTTPD_RESP_USE_STRLEN);
}

static esp_err_t captureHandler(httpd_req_t* request) {
  if (!cameraReady) {
    httpd_resp_set_status(request, "503 Service Unavailable");
    return httpd_resp_send(request, "camera unavailable", HTTPD_RESP_USE_STRLEN);
  }

  camera_fb_t* frame = esp_camera_fb_get();
  if (!frame) {
    return httpd_resp_send_err(
        request, HTTPD_500_INTERNAL_SERVER_ERROR, "camera capture failed");
  }

  if (frame->format != PIXFORMAT_JPEG) {
    esp_camera_fb_return(frame);
    return httpd_resp_send_err(
        request, HTTPD_500_INTERNAL_SERVER_ERROR, "camera did not return JPEG");
  }

  httpd_resp_set_type(request, "image/jpeg");
  httpd_resp_set_hdr(request, "Cache-Control", "no-store");
  esp_err_t result = httpd_resp_send(
      request, reinterpret_cast<const char*>(frame->buf), frame->len);
  esp_camera_fb_return(frame);
  return result;
}

static bool startCameraServer() {
  if (cameraServer != nullptr) {
    return true;
  }

  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.max_uri_handlers = 2;
  config.lru_purge_enable = true;

  esp_err_t result = httpd_start(&cameraServer, &config);
  if (result != ESP_OK) {
    Serial.printf("[camera] HTTP server start failed: 0x%x\n", result);
    return false;
  }

  httpd_uri_t healthUri = {};
  healthUri.uri = "/health";
  healthUri.method = HTTP_GET;
  healthUri.handler = healthHandler;

  httpd_uri_t captureUri = {};
  captureUri.uri = "/capture";
  captureUri.method = HTTP_GET;
  captureUri.handler = captureHandler;

  result = httpd_register_uri_handler(cameraServer, &healthUri);
  if (result == ESP_OK) {
    result = httpd_register_uri_handler(cameraServer, &captureUri);
  }
  if (result != ESP_OK) {
    Serial.printf("[camera] HTTP route registration failed: 0x%x\n", result);
    httpd_stop(cameraServer);
    cameraServer = nullptr;
    return false;
  }

  return true;
}

static void serviceCameraServer() {
  if (WiFi.status() != WL_CONNECTED || cameraServer != nullptr) {
    return;
  }

  unsigned long now = millis();
  if (now < nextServerStartAttempt) {
    return;
  }
  nextServerStartAttempt = now + 5000;

  Serial.print("[wifi] camera IP: ");
  Serial.println(WiFi.localIP());

  if (startCameraServer()) {
    Serial.printf("[camera] ready at http://%s/health and /capture\n",
                  WiFi.localIP().toString().c_str());
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);

  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_QQVGA;
  config.jpeg_quality = 14;
  config.fb_location = psramFound() ? CAMERA_FB_IN_PSRAM : CAMERA_FB_IN_DRAM;
  config.fb_count = psramFound() ? 2 : 1;
  config.grab_mode = psramFound() ? CAMERA_GRAB_LATEST : CAMERA_GRAB_WHEN_EMPTY;

  esp_err_t cameraResult = esp_camera_init(&config);
  if (cameraResult == ESP_OK) {
    cameraReady = true;
    Serial.println("[camera] sensor initialized at 160x120 JPEG");
  } else {
    Serial.printf("[camera] initialization failed: 0x%x\n", cameraResult);
  }

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.println("[wifi] connecting; HTTP server will start when connected");
}

void loop() {
  serviceCameraServer();
  delay(250);
}
