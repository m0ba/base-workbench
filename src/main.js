import { createApp } from 'vue';
import { Capacitor } from '@capacitor/core';
import { registerSW } from 'virtual:pwa-register';
import App from './App.vue';
import './style.css';

const isElectron = window.location.protocol === 'baseworkbench:';
if (!isElectron && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  registerSW({ immediate: true });
}

createApp(App).mount('#app');
