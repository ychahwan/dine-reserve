# Firebase Push Notification Setup Guide

## Overview

This guide walks you through setting up Firebase Cloud Messaging (FCM) for push notifications in the Kamix Android app.

## Prerequisites

- A Google account
- Android app with package name: `com.kamix.app`

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"**
3. Enter project name: `kamix-notifications`
4. Enable Google Analytics (optional)
5. Click **Create project**

## Step 2: Add Android App

1. In Firebase Console, click the **Android icon** (Add app)
2. Enter package name: `com.kamix.app`
3. Enter app nickname: `Kamix`
4. **Skip** SHA-1 for now (can add later)
5. Click **Register app**

## Step 3: Download google-services.json

1. Click **Download google-services.json**
2. Replace the placeholder file at:
   ```
   android/app/google-services.json
   ```

### Expected Structure

```json
{
  "project_info": {
    "project_number": "YOUR_PROJECT_NUMBER",
    "project_id": "your-project-id",
    "storage_bucket": "your-project-id.appspot.com"
  },
  "client": [
    {
      "client_info": {
        "mobilesdk_app_id": "1:123456789:android:abcdef",
        "android_client_info": {
          "package_name": "com.kamix.app"
        }
      },
      "oauth_client": [],
      "api_key": [
        {
          "current_key": "YOUR_API_KEY"
        }
      ],
      "services": {
        "appinvite_service": {
          "other_platform_oauth_client": []
        }
      }
    }
  ],
  "configuration_version": "1"
}
```

## Step 4: Get Server Key (for Backend)

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Click **Cloud Messaging** tab
3. Copy the **Server key** (legacy) or create a **Service Account**
4. Add to your `.env` file:
   ```
   FIREBASE_SERVER_KEY=your_server_key_here
   ```

## Step 5: Configure Service Account (Recommended)

1. Go to **Project Settings** → **Service accounts**
2. Click **Generate new private key**
3. Save the JSON file securely
4. Set environment variable:
   ```
   FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/serviceAccountKey.json
   ```

## Step 6: Rebuild the App

```bash
# Sync Capacitor
npx cap sync android

# Build release APK
cd android
./gradlew assembleRelease

# Copy to apk folder
cp app/build/outputs/apk/release/app-release.apk ../apk/kamix-release.apk
```

## Step 7: Test Push Notifications

### Using Firebase Console

1. Go to **Firebase Console** → **Messaging**
2. Click **New campaign** → **Notifications**
3. Enter title and body
4. Select your app
5. Send test notification

### Using cURL

```bash
curl -X POST \
  https://fcm.googleapis.com/fcm/send \
  -H "Authorization: key=YOUR_SERVER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "DEVICE_FCM_TOKEN",
    "notification": {
      "title": "Kamix",
      "body": "Your booking is confirmed!"
    },
    "data": {
      "bookingId": "12345",
      "type": "booking_confirmed"
    }
  }'
```

## Environment Variables

Add these to your `.env` file:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:android:abcdef

# Server-side (for backend)
FIREBASE_SERVER_KEY=your_server_key
FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json
```

## Troubleshooting

### "google-services.json not found" warning

- Ensure the file is at `android/app/google-services.json`
- Rebuild: `npx cap sync android`

### Notifications not appearing

1. Check device logs: `adb logcat | grep -i "firebase\|fcm"`
2. Verify token is registered in your database
3. Ensure server key is correct

### App crashes on startup

1. Verify package name matches in `google-services.json`
2. Check ProGuard rules aren't stripping Firebase classes

## Production Checklist

- [ ] Replace debug keystore with release keystore
- [ ] Enable ProGuard/R8 for release builds
- [ ] Set up server-side notification sending
- [ ] Test on multiple devices
- [ ] Monitor Firebase Console for delivery rates
