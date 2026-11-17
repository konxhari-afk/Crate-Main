# Crate — CapacitorJS Android APK & iOS Native Build Guide

## 1. Install Capacitor Core & CLI
```bash
npm install @capacitor/core
npm install -D @capacitor/cli
npm install @capacitor/android @capacitor/ios
```

## 2. Initialize Capacitor
```bash
npx cap init "Crate" "fm.crate.player" --web-dir=dist
```

## 3. Build Web Bundle & Add Native Platforms
```bash
npm run build
npx cap add android
npx cap add ios
npx cap sync
```

## 4. Build Local Android Debug APK (without Android Studio GUI)
```bash
cd android
./gradlew assembleDebug
# Output APK: android/app/build/outputs/apk/debug/app-debug.apk
```

## 5. Build Release AAB / APK
```bash
cd android
./gradlew assembleRelease
```

## 6. iOS Standalone PWA Meta Checklist
- `apple-mobile-web-app-capable="yes"`
- `apple-mobile-web-app-status-bar-style="black-translucent"`
- `theme-color="#050709"`
- `apple-touch-icon` pointing to `/apple-touch-icon.png` (180x180 PNG)
