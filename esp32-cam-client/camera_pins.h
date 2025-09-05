/**
 * Camera Pin Definitions for ESP32-CAM AI-Thinker
 * 
 * This file contains the GPIO pin assignments for the ESP32-CAM AI-Thinker board.
 * These definitions are used by the ESP32 camera library to initialize the camera module.
 * 
 * Board: ESP32-CAM AI-Thinker
 * Camera: OV2640
 */

#pragma once

// Camera module pin assignments for ESP32-CAM AI-Thinker
#define PWDN_GPIO_NUM     32    // Power down pin
#define RESET_GPIO_NUM    -1    // Reset pin (not connected)
#define XCLK_GPIO_NUM      0    // External clock pin
#define SIOD_GPIO_NUM     26    // I2C SDA (SCCB)
#define SIOC_GPIO_NUM     27    // I2C SCL (SCCB)

// Camera data pins (parallel interface)
#define Y9_GPIO_NUM       35    // Data bit 7
#define Y8_GPIO_NUM       34    // Data bit 6
#define Y7_GPIO_NUM       39    // Data bit 5
#define Y6_GPIO_NUM       36    // Data bit 4
#define Y5_GPIO_NUM       21    // Data bit 3
#define Y4_GPIO_NUM       19    // Data bit 2
#define Y3_GPIO_NUM       18    // Data bit 1
#define Y2_GPIO_NUM        5    // Data bit 0

// Camera control pins
#define VSYNC_GPIO_NUM    25    // Vertical sync
#define HREF_GPIO_NUM     23    // Horizontal reference
#define PCLK_GPIO_NUM     22    // Pixel clock

// Additional ESP32-CAM AI-Thinker specific pins
#define LED_GPIO_NUM       4    // Built-in LED (shared with flash)
#define FLASH_GPIO_NUM     4    // Camera flash LED
