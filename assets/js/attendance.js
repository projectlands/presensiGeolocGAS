/**
 * User Geolocation & Selfie Camera Operations Handler
 */

document.addEventListener('alpine:init', () => {
  Alpine.data('attendanceData', () => ({
    // Geolocation States
    latitude: null,
    longitude: null,
    accuracy: null,
    distance: null,
    isValidRadius: false,
    gpsLoading: true,
    gpsError: '',
    geofenceError: '',
    watchId: null,
    prevPosition: null,

    // Nearest Target Office configuration
    nearestLocation: null,
    locations: [],

    // Camera/Selfie States
    videoStream: null,
    selfieData: null,
    isCameraOpen: false,
    cameraError: '',
    cameraLoading: false,

    // Attendance records
    todayAttendance: null,
    loadingLogs: false,
    historyLogs: [],

    // Clock Actions
    currentTime: '',
    currentDate: '',

    init() {
      // Validate session
      if (!Auth.checkProtection('user')) return;

      // Start global clocks
      this.updateClock();
      setInterval(() => this.updateClock(), 1000);

      // Initialize Geolocation & Fetch User Attendance History
      this.initWorkflow();

      // Listen for pull to refresh updates
      window.addEventListener('refresh-app-data', () => {
        this.initWorkflow();
      });
    },

    async initWorkflow() {
      this.gpsLoading = true;
      this.gpsError = '';
      
      try {
        // 1. Fetch Location Radius Configurations
        const configRes = await ApiService.getConfig();
        const user = Auth.getUser();
        if (configRes.success && configRes.data.length > 0) {
          // Filter locations that are assigned to this user
          this.locations = configRes.data.filter(loc => {
            const assigned = loc.assigned_users || '*';
            return assigned === '*' || assigned === '' || assigned.split(',').includes(user.id);
          });
        } else {
          // Absolute fallback if empty
          this.locations = [{
            location_id: 'LOC-FALLBACK',
            office_name: 'Balisai HQ Default',
            office_lat: -8.6705,
            office_lng: 115.2126,
            radius: 100,
            assigned_users: '*',
            active_days: 'Senin,Selasa,Rabu,Kamis,Jumat,Sabtu,Minggu'
          }];
        }

        if (this.locations.length === 0) {
          this.gpsError = 'Tidak ada lokasi absensi yang ditugaskan untuk akun Anda. Harap hubungi Admin.';
          this.gpsLoading = false;
          return;
        }

        // 2. Start Realtime Geolocation Tracker
        this.startGpsTracking();

        // 3. Fetch User attendance logs
        await this.fetchUserLogs();
      } catch (err) {
        console.error(err);
        this.gpsError = 'Gagal memuat konfigurasi absensi.';
        this.gpsLoading = false;
      }
    },

    updateClock() {
      const now = new Date();
      this.currentTime = Helper.formatTime(now);
      this.currentDate = Helper.formatDateTime(Helper.formatDate(now));
    },

    /**
     * Set up real-time geolocation tracking with watchPosition
     */
    startGpsTracking() {
      if (!navigator.geolocation) {
        this.gpsError = 'Browser Anda tidak mendukung layanan Geolokasi.';
        this.gpsLoading = false;
        return;
      }

      if (this.watchId) {
        navigator.geolocation.clearWatch(this.watchId);
      }

      const geoOptions = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      };

      this.watchId = navigator.geolocation.watchPosition(
        (position) => {
          this.gpsLoading = false;
          this.gpsError = '';
          
          // Telemetry spoofing checks
          const mockCheck = Helper.detectMockGPS(position);
          if (mockCheck.spoofed) {
            this.gpsError = mockCheck.reason;
            this.isValidRadius = false;
            return;
          }

          // Physics anomaly check
          if (this.prevPosition) {
            const speedCheck = Helper.checkSpeedAnomaly(this.prevPosition, position);
            if (speedCheck.anomaly) {
              this.gpsError = speedCheck.reason;
              this.isValidRadius = false;
              return;
            }
          }

          this.prevPosition = position;
          this.latitude = position.coords.latitude;
          this.longitude = position.coords.longitude;
          this.accuracy = position.coords.accuracy;

          // Map nearest target branch automatically
          this.evaluateProximity();
        },
        (error) => {
          console.error('GPS Watch Error:', error);
          this.gpsLoading = false;
          switch (error.code) {
            case error.PERMISSION_DENIED:
              this.gpsError = 'Izin GPS ditolak. Tolong aktifkan akses lokasi di browser.';
              break;
            case error.POSITION_UNAVAILABLE:
              this.gpsError = 'Informasi lokasi tidak tersedia. Coba cek sinyal GPS Anda.';
              break;
            case error.TIMEOUT:
              this.gpsError = 'Waktu permintaan lokasi habis. Menyegarkan kembali...';
              break;
            default:
              this.gpsError = 'Terjadi kesalahan sistem GPS.';
          }
        },
        geoOptions
      );
    },

    /**
     * Compute Haversine distance to locate closest branch
     */
    evaluateProximity() {
      this.geofenceError = '';
      if (this.locations.length === 0 || !this.latitude) return;

      let closestLoc = null;
      let minDistance = Infinity;

      this.locations.forEach(loc => {
        const d = Helper.calculateDistance(
          this.latitude, this.longitude,
          parseFloat(loc.office_lat), parseFloat(loc.office_lng)
        );

        if (d < minDistance) {
          minDistance = d;
          closestLoc = loc;
        }
      });

      this.nearestLocation = closestLoc;
      this.distance = minDistance;

      if (!closestLoc) {
        this.isValidRadius = false;
        return;
      }

      // Check operational active days limit
      const daysOfWeek = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      const currentDayName = daysOfWeek[new Date().getDay()];
      const activeDaysStr = closestLoc.active_days || 'Senin,Selasa,Rabu,Kamis,Jumat,Sabtu,Minggu';
      const activeDaysArr = activeDaysStr.split(',').map(d => d.trim());
      
      const isTodayActive = activeDaysArr.includes(currentDayName);

      const isClosestWfh = closestLoc.is_wfh === 'ya' || closestLoc.is_wfh === 'true' || closestLoc.is_wfh === true;

      // Validate threshold radius AND operational day
      if (isClosestWfh) {
        if (isTodayActive) {
          this.isValidRadius = true;
          this.geofenceError = `Mode WFH Aktif: Anda terhubung ke lokasi ${closestLoc.office_name} (Bebas Radius).`;
        } else {
          this.isValidRadius = false;
          this.geofenceError = `Absensi WFH (${closestLoc.office_name}) tidak aktif hari ini (${currentDayName}). Hari aktif WFH: ${activeDaysStr}.`;
        }
      } else if (minDistance <= closestLoc.radius) {
        if (isTodayActive) {
          this.isValidRadius = true;
          this.geofenceError = ''; // Clear error if valid
        } else {
          this.isValidRadius = false;
          this.geofenceError = `Absensi tidak aktif hari ini (${currentDayName}). Hari aktif: ${activeDaysStr}.`;
        }
      } else {
        // Outside the radius of the physically closest location.
        // Check if there is any other assigned location that has is_wfh active and is active today!
        const wfhLoc = this.locations.find(loc => {
          const isWfh = loc.is_wfh === 'ya' || loc.is_wfh === 'true' || loc.is_wfh === true;
          if (!isWfh) return false;
          
          // Check if WFH location is active today
          const activeDaysStr = loc.active_days || 'Senin,Selasa,Rabu,Kamis,Jumat,Sabtu,Minggu';
          const activeDaysArr = activeDaysStr.split(',').map(d => d.trim());
          return activeDaysArr.includes(currentDayName);
        });
        
        if (wfhLoc) {
          this.nearestLocation = wfhLoc;
          this.distance = minDistance; // Keep distance parameter but bypass checking
          this.isValidRadius = true;
          this.geofenceError = `Mode WFH Aktif: Anda terhubung ke lokasi ${wfhLoc.office_name} (Bebas Radius).`;
        } else {
          this.isValidRadius = false;
          // If not in radius, reset any day error to prevent confusing the user
          if (!isTodayActive) {
            this.geofenceError = `Absensi di cabang terdekat tidak aktif hari ini (${currentDayName}).`;
          }
        }
      }
    },

    /**
     * Get user attendance database logs
     */
    async fetchUserLogs() {
      this.loadingLogs = true;
      try {
        const user = Auth.getUser();
        const res = await ApiService.getAttendance(user.id);
        
        if (res.success) {
          const todayStr = Helper.formatDate(new Date());
          
          // Sort reverse chronological
          const sorted = res.data.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
          this.historyLogs = sorted;

          // Map today's logs
          this.todayAttendance = sorted.find(l => l.tanggal === todayStr) || null;
        }
      } catch (err) {
        console.error('Logs fetch error:', err);
      } finally {
        this.loadingLogs = false;
      }
    },

    /**
     * Camera Handling Modules
     */
    async startCamera() {
      this.cameraError = '';
      this.cameraLoading = true;
      this.isCameraOpen = true;

      // Diagnostics check for Secure Context (HTTPS/Localhost) & MediaDevices capability
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!isLocalhost && window.location.protocol !== 'https:') {
        this.cameraError = 'Akses kamera diblokir karena koneksi tidak aman (HTTP). Silakan buka dashboard menggunakan HTTPS.';
        this.cameraLoading = false;
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.cameraError = 'Fitur kamera tidak didukung atau dinonaktifkan di browser ini. Gunakan Chrome/Safari dengan izin aktif.';
        this.cameraLoading = false;
        return;
      }

      // Small delay to let modal open and canvas render
      await new Promise(resolve => setTimeout(resolve, 300));

      const constraints = {
        video: {
          facingMode: 'user', // Selfie camera
          width: { ideal: 480 },
          height: { ideal: 480 }
        },
        audio: false
      };

      try {
        if (this.videoStream) {
          this.stopCamera();
        }

        let stream;
        try {
          // Attempt standard ideal constraints
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
          console.warn('Ideal WebRTC constraints failed, attempting fallback...', err);
          // Permissive fallback video-only stream
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: false
          });
        }
        this.videoStream = stream;
        
        const videoEl = document.getElementById('cameraPreview');
        if (videoEl) {
          videoEl.srcObject = stream;
          videoEl.play();
        }
      } catch (err) {
        console.error('Webcam access error:', err);
        this.cameraError = 'Gagal mengakses kamera depan Anda. Pastikan izin kamera aktif.';
      } finally {
        this.cameraLoading = false;
      }
    },

    stopCamera() {
      if (this.videoStream) {
        this.videoStream.getTracks().forEach(track => track.stop());
        this.videoStream = null;
      }
      this.isCameraOpen = false;
    },

    captureSelfie() {
      try {
        const videoEl = document.getElementById('cameraPreview');
        const canvasEl = document.getElementById('captureCanvas');

        if (!videoEl || !canvasEl) {
          console.error('Preview elements not found.');
          return;
        }

        const context = canvasEl.getContext('2d');
        // Reset transform context first to avoid cumulative transforms on retakes
        context.setTransform(1, 0, 0, 1, 0, 0);
        
        // Mirror front camera
        context.translate(canvasEl.width, 0);
        context.scale(-1, 1);
        
        // Capture frame
        context.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
        
        // Convert to base64
        this.selfieData = canvasEl.toDataURL('image/jpeg', 0.8);
        this.stopCamera();
      } catch (err) {
        console.error('Selfie capture failed:', err);
        Helper.alert(
          'Gagal Mengambil Foto',
          `Terjadi kesalahan pada modul kamera: ${err.message}. Harap pastikan izin kamera aktif atau coba gunakan browser Chrome/Safari terbaru.`,
          'error'
        );
      }
    },

    resetSelfie() {
      this.selfieData = null;
      this.startCamera();
    },

    closeCameraModal() {
      this.stopCamera();
      this.selfieData = null;
    },

    async triggerAttendanceAction(type) {
      const activeLoc = this.nearestLocation;
      const isPhotoRequired = !activeLoc || activeLoc.required_photo === 'ya' || activeLoc.required_photo === 'true' || activeLoc.required_photo === true;

      if (isPhotoRequired) {
        Alpine.store('app').activeAction = type;
        this.startCamera();
      } else {
        // Direct Presensi without Camera
        const confirm = await Swal.fire({
          title: `Kirim Presensi ${type === 'masuk' ? 'Masuk' : 'Pulang'}?`,
          text: `Anda terhubung ke lokasi ${activeLoc.office_name} (Bebas Foto). Kirim data absensi sekarang?`,
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Ya, Kirim',
          cancelButtonText: 'Batal',
          customClass: {
            popup: 'rounded-2xl glass-panel text-slate-800 dark:text-slate-100',
            confirmButton: 'px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition mr-2',
            cancelButton: 'px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium transition'
          },
          buttonsStyling: false
        });

        if (!confirm.isConfirmed) return;

        this.selfieData = ''; // Empty selfie
        await this.submitAttendance(type);
      }
    },

    /**
     * Save Check-in or Check-out attendance
     */
    async submitAttendance(type) {
      const activeLoc = this.nearestLocation;
      const isPhotoRequired = !activeLoc || activeLoc.required_photo === 'ya' || activeLoc.required_photo === 'true' || activeLoc.required_photo === true;

      if (isPhotoRequired && !this.selfieData) {
        Helper.alert('Selfie Diperlukan', 'Harap lakukan foto selfie terlebih dahulu sebelum absensi!', 'warning');
        return;
      }

      if (!this.isValidRadius) {
        Helper.alert('Kesalahan Lokasi', 'Anda berada di luar radius kantor yang diizinkan!', 'error');
        return;
      }

      Helper.showLoading('Mengirim data absensi Anda...');
      
      try {
        const user = Auth.getUser();
        const now = new Date();
        const dateStr = Helper.formatDate(now);
        const timeStr = Helper.formatTime(now);

        const attendancePayload = {
          user_id: user.id,
          nama: user.nama,
          tanggal: dateStr,
          latitude: this.latitude,
          longitude: this.longitude,
          jarak: this.distance,
          selfie_url: this.selfieData, // Will upload base64 image
          isClockOut: type === 'pulang'
        };

        if (type === 'masuk') {
          attendancePayload.jam_masuk = timeStr;
          const activeLoc = this.nearestLocation;
          const isWfh = activeLoc && (activeLoc.is_wfh === 'ya' || activeLoc.is_wfh === 'true' || activeLoc.is_wfh === true);
          const isLate = timeStr > '08:00:00';
          if (isWfh) {
            attendancePayload.status = isLate ? 'Terlambat (WFH)' : 'Hadir (WFH)';
          } else {
            attendancePayload.status = isLate ? 'Terlambat' : 'Hadir';
          }
        } else {
          attendancePayload.jam_pulang = timeStr;
        }

        const res = await ApiService.saveAttendance(attendancePayload);

        Helper.closeLoading();

        if (res.success) {
          this.selfieData = null;
          Helper.alert(
            'Absensi Berhasil!',
            `Presensi ${type === 'masuk' ? 'Masuk' : 'Pulang'} Anda tersimpan pada pukul ${timeStr.substring(0, 5)}.`,
            'success'
          );
          
          // Re-fetch history
          await this.fetchUserLogs();
        } else {
          Helper.alert('Gagal Absensi', res.message || 'Terjadi kesalahan internal.', 'error');
        }
      } catch (err) {
        console.error(err);
        Helper.closeLoading();
        Helper.alert('Kesalahan', 'Gagal memproses absensi. Silakan coba lagi.', 'error');
      }
    }
  }));
});
