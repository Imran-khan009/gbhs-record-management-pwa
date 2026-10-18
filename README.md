# GBHS Record Management System (PWA & Android App)

A modern, high-performance School Record Management application built with React, Vite, TypeScript, Tailwind CSS, IndexedDB, and Capacitor for Android.

## Features
- 📊 **Dynamic Multi-Class Student Management**: Dynamic roster handling for classes 6th through 10th without hardcoded limits.
- 📁 **Smart Excel & CSV Importer**: Dynamic header row detection, Urdu/English column alias matching, interactive preview & column mapping, and attendance history preservation.
- 📱 **Android APK Mode**: Powered by Capacitor (`pk.edu.gbhs.recordmanagement`).
- ⚡ **Offline First PWA**: IndexedDB local storage with instant performance and optional Supabase cloud sync.

---

## 📲 Download Android APK

The Android APK is compiled automatically by GitHub Actions:

1. **Direct Download from GitHub Releases**:
   - Go to [Releases](https://github.com/Imran-khan009/gbhs-record-management-pwa/releases)
   - Download `gbhs-record-management.apk`
   - Install directly on any Android device.
2. **From GitHub Actions Artifacts**:
   - Go to the **Actions** tab on GitHub.
   - Click on the latest **Build Android APK** workflow run.
   - Under **Artifacts**, download `gbhs-record-management-apk`.

---

## 🛠️ Local Development

### Prerequisites
- [Bun](https://bun.sh/) (or Node.js)
- Git

### Installation & Run Web
```bash
# Install dependencies
bun install

# Start local development server
bun run dev

# Build production bundle
bun run build
```

---

## 📱 Android Development (Local)

If you have Android Studio installed on your computer:

```bash
# Sync web build to Android native project
bun run android:sync

# Open project in Android Studio
bun run android:open
```
In Android Studio, click **Build > Build Bundle(s) / APK(s) > Build APK(s)** to generate a debug or release APK locally.
