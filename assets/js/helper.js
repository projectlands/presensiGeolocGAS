/**
 * Helper Utilities for PWA Geolocation Attendance System
 */

const Helper = {
  /**
   * Calculate distance between two coordinates using Haversine formula
   * @returns Distance in meters
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  },

  /**
   * Format Javascript Date object to YYYY-MM-DD
   */
  formatDate(date) {
    const d = new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    return `${year}-${month}-${day}`;
  },

  /**
   * Format Javascript Date object to HH:MM:SS
   */
  formatTime(date) {
    const d = new Date(date);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  },

  /**
   * Format date/time to local readable text
   */
  formatDateTime(dateStr, timeStr = '') {
    if (!dateStr) return '-';
    let dateObj;
    if (timeStr) {
      dateObj = new Date(`${dateStr}T${timeStr}`);
    } else {
      dateObj = new Date(dateStr);
    }
    
    if (isNaN(dateObj.getTime())) return dateStr + (timeStr ? ` ${timeStr}` : '');
    
    return dateObj.toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }) + (timeStr ? ` Pukul ${timeStr.substring(0, 5)}` : '');
  },

  /**
   * Telemetry validation to identify GPS spoofing/low accuracy
   */
  detectMockGPS(position) {
    const coords = position.coords;
    
    // 1. Accuracy Check: Spoof tools or low-tier signals can have unusually high error margins
    if (coords.accuracy && coords.accuracy > 80) {
      return {
        spoofed: true,
        reason: `Akurasi GPS terlalu rendah (${Math.round(coords.accuracy)}m). Pastikan Anda berada di luar ruangan dengan pandangan langit terbuka.`
      };
    }

    // 2. HTML5 Mock Location flag (supported by some secure browsers/native wrappers)
    if (position.mocked || (coords && coords.mocked)) {
      return {
        spoofed: true,
        reason: 'Deteksi Fake GPS: Sistem mendeteksi koordinat Anda berasal dari aplikasi simulasi lokasi.'
      };
    }

    return { spoofed: false, reason: '' };
  },

  /**
   * Compare two positions to detect physics-defying speed changes
   */
  checkSpeedAnomaly(prevPos, currPos) {
    if (!prevPos || !currPos) return { anomaly: false };

    const distance = this.calculateDistance(
      prevPos.coords.latitude, prevPos.coords.longitude,
      currPos.coords.latitude, currPos.coords.longitude
    );

    const timeDiffSec = (currPos.timestamp - prevPos.timestamp) / 1000;
    if (timeDiffSec <= 1) return { anomaly: false };

    const speedKmh = (distance / timeDiffSec) * 3.6;
    
    // If movement is faster than 150 km/h (impossible for standard walking/jogging or typical traffic in office radius)
    if (speedKmh > 150 && distance > 200) {
      return {
        anomaly: true,
        speed: speedKmh,
        reason: `Perpindahan posisi terlalu cepat (${Math.round(speedKmh)} km/jam). Mengindikasikan manipulasi lokasi.`
      };
    }

    return { anomaly: false };
  },

  /**
   * SweetAlert notifications
   */
  Toast: Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    didOpen: (toast) => {
      toast.addEventListener('mouseenter', Swal.stopTimer);
      toast.addEventListener('mouseleave', Swal.resumeTimer);
    }
  }),

  alert(title, text, icon = 'info') {
    return Swal.fire({
      title,
      text,
      icon,
      customClass: {
        popup: 'rounded-2xl glass-panel text-slate-800 dark:text-slate-100',
        confirmButton: 'px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition'
      },
      buttonsStyling: false
    });
  },

  showLoading(message = 'Memproses data...') {
    Swal.fire({
      title: message,
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
      customClass: {
        popup: 'rounded-2xl glass-panel text-slate-800 dark:text-slate-100'
      }
    });
  },

  closeLoading() {
    Swal.close();
  },

  /**
   * Seed Mock Database in LocalStorage for offline demonstration/fallback
   */
  seedDummyData() {
    // 1. Users
    if (!localStorage.getItem('presensi_users')) {
      const dummyUsers = [
        { id: 'USR-1000', nama: 'Administrator Balisai', username: 'admin', password: 'admin123', role: 'admin', status: 'aktif' },
        { id: 'USR-1001', nama: 'John Doe Developer', username: 'user', password: 'user123', role: 'user', status: 'aktif' },
        { id: 'USR-1002', nama: 'Alice Smith Staff', username: 'alice', password: 'user123', role: 'user', status: 'aktif' },
        { id: 'USR-1003', nama: 'Bob Johnson Inactive', username: 'bob', password: 'user123', role: 'user', status: 'nonaktif' }
      ];
      localStorage.setItem('presensi_users', JSON.stringify(dummyUsers));
    }

    // 2. Multi-location configurations
    if (!localStorage.getItem('presensi_config')) {
      const dummyConfig = [
        { location_id: 'LOC-01', office_name: 'Balisai Orchids HQ (Sanur)', office_lat: -8.6705, office_lng: 115.2126, radius: 100, assigned_users: '*', active_days: 'Senin,Selasa,Rabu,Kamis,Jumat' },
        { location_id: 'LOC-02', office_name: 'Kampus IT Sudirman', office_lat: -8.6582, office_lng: 115.2198, radius: 150, assigned_users: '*', active_days: 'Senin,Selasa,Rabu,Kamis,Jumat' },
        { location_id: 'LOC-03', office_name: 'Cabang Renon Plaza', office_lat: -8.6815, office_lng: 115.2285, radius: 50, assigned_users: 'USR-1001', active_days: 'Senin,Selasa,Rabu,Kamis' }
      ];
      localStorage.setItem('presensi_config', JSON.stringify(dummyConfig));
    }

    // 3. Historical Attendance logs
    if (!localStorage.getItem('presensi_absensi')) {
      const today = this.formatDate(new Date());
      const yesterday = this.formatDate(new Date(Date.now() - 86400000));
      const twoDaysAgo = this.formatDate(new Date(Date.now() - 172800000));

      const dummyAbsensi = [
        {
          id: 'ATT-001',
          user_id: 'USR-1001',
          nama: 'John Doe Developer',
          tanggal: twoDaysAgo,
          jam_masuk: '07:45:12',
          jam_pulang: '17:05:00',
          latitude: -8.6703,
          longitude: 115.2124,
          jarak: 32,
          selfie_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200',
          status: 'Hadir'
        },
        {
          id: 'ATT-002',
          user_id: 'USR-1002',
          nama: 'Alice Smith Staff',
          tanggal: twoDaysAgo,
          jam_masuk: '08:15:30',
          jam_pulang: '17:00:15',
          latitude: -8.6704,
          longitude: 115.2125,
          jarak: 18,
          selfie_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=200',
          status: 'Terlambat'
        },
        {
          id: 'ATT-003',
          user_id: 'USR-1001',
          nama: 'John Doe Developer',
          tanggal: yesterday,
          jam_masuk: '07:55:00',
          jam_pulang: '17:01:24',
          latitude: -8.6705,
          longitude: 115.2126,
          jarak: 4,
          selfie_url: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=200',
          status: 'Hadir'
        },
        {
          id: 'ATT-004',
          user_id: 'USR-1002',
          nama: 'Alice Smith Staff',
          tanggal: yesterday,
          jam_masuk: '08:30:10',
          jam_pulang: '',
          latitude: -8.6708,
          longitude: 115.2122,
          jarak: 55,
          selfie_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200',
          status: 'Terlambat'
        }
      ];
      localStorage.setItem('presensi_absensi', JSON.stringify(dummyAbsensi));
    }
  }
};

// Auto-seed on include
Helper.seedDummyData();
window.Helper = Helper;
