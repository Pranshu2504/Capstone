# ZORA Frontend

This is the React Native frontend for the Zora project.

## ⚠️ Special Windows Setup (Required)

Because Windows has a default path length limit of 260 characters, and this project has deep nested dependencies, you **must** use a virtual drive to build the Android application.

### 1. Map a Virtual Drive
Open a terminal (Command Prompt or PowerShell) and run:
```powershell
subst Z: "C:\Users\kaurn\Desktop\zora"
```
*Note: You only need to do this once per login session.*

### 2. Configure Android SDK
Ensure you have a `frontend/android/local.properties` file with your SDK path:
```properties
sdk.dir=C:\\Users\\kaurn\\AppData\\Local\\Android\\Sdk
```

## 🚀 How to Run the App

You will need **two** terminal windows.

### Terminal 1: Metro Bundler (The Server)
Run this from your **original C: drive** path:
```powershell
cd C:\Users\kaurn\Desktop\zora\frontend
npx react-native start --reset-cache
```

### Terminal 2: Build & Install
Run this from the **mapped Z: drive**:
```powershell
Z:
cd frontend
npx react-native run-android
```

---

## 🛠 Project Structure
- `src/screens`: UI Screens (Door, Interview, Wardrobe, etc.)
- `src/constants`: Mock data and theme colors
- `src/hooks`: Custom React hooks (theming, etc.)
- `assets`: Images and local resources

## 🐛 Troubleshooting

### Build fails with "Filename longer than 260 characters"
Make sure you are running the `run-android` command from the **Z: drive**.

### Metro "SHA-1" error
If Metro (running on C:) gets confused about file hashes, restart it with:
`npx react-native start --reset-cache`

### App shows "Development Error" on phone
Ensure your phone is connected via USB and you have authorized the PC. Try running:
`adb reverse tcp:8081 tcp:8081`
