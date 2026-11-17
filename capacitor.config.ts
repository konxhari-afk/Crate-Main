// CapacitorJS Configuration for Crate Native Android & iOS Wrapping
// Install: npm install @capacitor/core @capacitor/cli && npm install @capacitor/android @capacitor/ios

const config = {
  appId: 'fm.crate.player',
  appName: 'Crate',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // For SSR / live hosted mode (e.g. Freebuff or Vercel URL), uncomment:
    // url: process.env.APP_URL,
    // cleartext: false,
  },
  android: {
    backgroundColor: '#050709',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    backgroundColor: '#050709',
    contentInset: 'always',
    preferredContentMode: 'mobile',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#050709',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#050709',
    },
  },
};

export default config;
