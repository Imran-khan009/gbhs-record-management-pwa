import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'pk.edu.gbhs.recordmanagement',
  appName: 'GBHS Record Management',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
