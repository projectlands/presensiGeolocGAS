/**
 * Main App Script - Engine & State Manager
 */

document.addEventListener('alpine:init', () => {
  // Global App Configuration Store
  Alpine.store('app', {
    darkMode: localStorage.getItem('presensi_dark_mode') === 'true',
    apiUrl: 'https://script.google.com/macros/s/AKfycbz5Q2_5mM3SSh-DQiYJ8wPC2Fv9iZjTxO74bFfJCP_nvrgxX2ksjPN2EGZKNHgWvFWx/exec', // Google Apps Script URL
    isMockMode: false,
    isOnline: navigator.onLine,

    // PWA Install Prompt States
    deferredPrompt: null,
    showInstallBanner: false,
    isStandalone: window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,

    init() {
      // Apply theme
      this.applyTheme();

      // Listen for standalone display mode change
      window.matchMedia('(display-mode: standalone)').addListener((evt) => {
        this.isStandalone = evt.matches;
        if (this.isStandalone) this.showInstallBanner = false;
      });

      // Listen for PWA beforeinstallprompt event
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        this.deferredPrompt = e;

        // Show our custom banner only if running as a web app in browser
        if (!this.isStandalone) {
          this.showInstallBanner = true;
        }
      });

      // Listen for appinstalled success event
      window.addEventListener('appinstalled', () => {
        console.log('[PWA] Aplikasi berhasil terinstal!');
        this.isStandalone = true;
        this.showInstallBanner = false;
        this.deferredPrompt = null;
        Helper.Toast.fire({
          icon: 'success',
          title: 'Presensi Geoloc berhasil terpasang di perangkat Anda!'
        });
      });

      // If running on iOS outside standalone mode, show custom iOS install guide!
      const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      if (isiOS && !this.isStandalone) {
        // Delay slightly to let page render
        setTimeout(() => {
          this.showInstallBanner = true;
        }, 1500);
      }

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
    },

    async triggerInstall() {
      if (this.deferredPrompt) {
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          console.log('[PWA] User menerima installasi.');
          this.showInstallBanner = false;
        }
        this.deferredPrompt = null;
      } else {
        // Check if iOS
        const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isiOS) {
          Helper.alert(
            'Panduan Pemasangan iOS',
            '1. Ketuk tombol "Bagikan" (Share) di bagian bawah Safari.\n2. Gulir ke bawah dan ketuk "Tambahkan ke Layar Utama" (Add to Home Screen).\n3. Ketuk "Tambah" (Add) di sudut kanan atas.',
            'info'
          );
        } else {
          Helper.alert(
            'Petunjuk Instalasi',
            'Buka menu browser Anda (titik tiga di kanan atas) dan ketuk "Tambahkan ke Layar Utama" atau "Instal Aplikasi".',
            'info'
          );
        }
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
