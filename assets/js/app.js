/**
 * Main App Script - Engine & State Manager
 */

document.addEventListener('alpine:init', () => {
  // Global App Configuration Store
  Alpine.store('app', {
    darkMode: localStorage.getItem('presensi_dark_mode') === 'true',
    apiUrl: 'https://script.google.com/macros/s/AKfycbwtwKqt6N1sNa4hyU6rcLI3O0LWj_ifgtryZinY4VB5AFT7GWHph22L-rqmP_cXojp5/exec', // Google Apps Script URL
    isMockMode: false,
    isOnline: navigator.onLine,

    init() {
      // Apply theme
      this.applyTheme();

      // Monitor network
      window.addEventListener('online', () => {
        this.isOnline = true;
        Helper.Toast.fire({
          icon: 'success',
          title: 'Koneksi internet terhubung kembali.'
        });
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
        Helper.Toast.fire({
          icon: 'error',
          title: 'Koneksi terputus. Menggunakan data offline.'
        });
      });

      // Register PWA Service Worker
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('./service-worker.js')
            .then((reg) => console.log('[PWA] Service Worker terdaftar. Scope:', reg.scope))
            .catch((err) => console.error('[PWA] Registrasi Service Worker gagal:', err));
        });
      }
    },

    toggleDarkMode() {
      this.darkMode = !this.darkMode;
      localStorage.setItem('presensi_dark_mode', this.darkMode);
      this.applyTheme();
    },

    applyTheme() {
      if (this.darkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  });
});

// Setup Mobile Pull-To-Refresh Interaction
let touchStart = 0;
let touchEnd = 0;

window.addEventListener('touchstart', (e) => {
  touchStart = e.targetTouches[0].clientY;
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  touchEnd = e.targetTouches[0].clientY;
  const currentScroll = window.scrollY || document.documentElement.scrollTop;

  if (currentScroll === 0 && touchEnd - touchStart > 180) {
    // Threshold met, can trigger smooth reload indicator
    const pullEl = document.getElementById('pull-to-refresh-indicator');
    if (pullEl) {
      pullEl.style.transform = 'translateY(0px)';
      pullEl.style.opacity = '1';
    }
  }
}, { passive: true });

window.addEventListener('touchend', () => {
  const pullEl = document.getElementById('pull-to-refresh-indicator');
  if (pullEl && pullEl.style.opacity === '1') {
    pullEl.style.transform = 'translateY(-60px)';
    pullEl.style.opacity = '0';

    // Pulse toast and refresh location
    Helper.Toast.fire({
      icon: 'info',
      title: 'Memperbarui data...'
    });

    // Dispatch global refresh event
    window.dispatchEvent(new CustomEvent('refresh-app-data'));
  }
  touchStart = 0;
  touchEnd = 0;
}, { passive: true });
