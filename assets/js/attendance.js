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

    startGpsTracking() {
      if (!navigator.geolocation) {
        this.gpsError = 'Browser Anda tidak mendukung layanan Geolokasi.';
        this.gpsLoading = false;
        return;
      }

      const geoOptions = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (position.coords.latitude === 0 && position.coords.longitude === 0) {
            console.warn('Ignore Null Island (0,0) coordinates.');
            this.gpsLoading = false;
            return;
          }

          // Telemetry spoofing checks
          const mockCheck = Helper.detectMockGPS(position);
          if (mockCheck.spoofed) {
            this.gpsError = mockCheck.reason;
            this.isValidRadius = false;
            this.gpsLoading = false;
            return;
          }

          this.latitude = position.coords.latitude;
          this.longitude = position.coords.longitude;
          this.accuracy = position.coords.accuracy;
          this.gpsError = ''; // Clear any previous GPS errors on success

          // Map nearest target branch automatically
          this.evaluateProximity();
          
          this.gpsLoading = false;
        },
        (error) => {
          console.error('GPS GetPosition Error:', error);
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

    canClockOut() {
      if (!this.nearestLocation) return false;
      const endHour = this.nearestLocation.working_hour_end || '17:00';
      const currentTimeStr = this.currentTime; // e.g. "08:30:15"
      if (!currentTimeStr) return false;
      return currentTimeStr >= (endHour + ':00');
    },

    /**
     * Compute Haversine distance to locate closest branch
     */
    evaluateProximity() {
      this.geofenceError = '';
      if (this.locations.length === 0 || !this.latitude) return;

      const daysOfWeek = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      const currentDayName = daysOfWeek[new Date().getDay()];

      // 1. Dapatkan lokasi-lokasi yang aktif hari ini
      const activeLocationsToday = this.locations.filter(loc => {
        const activeDaysStr = loc.active_days || 'Senin,Selasa,Rabu,Kamis,Jumat,Sabtu,Minggu';
        const activeDaysArr = activeDaysStr.split(',').map(d => d.trim());
        return activeDaysArr.includes(currentDayName);
      });

      // Dapatkan lokasi fisik terdekat (berdasarkan koordinat) untuk kalkulasi jarak dasar
      let physicallyClosest = null;
      let minPhysDistance = Infinity;

      this.locations.forEach(loc => {
        const d = Helper.calculateDistance(
          this.latitude, this.longitude,
          parseFloat(loc.office_lat), parseFloat(loc.office_lng)
        );
        if (d < minPhysDistance) {
          minPhysDistance = d;
          physicallyClosest = loc;
        }
      });

      this.nearestLocation = physicallyClosest;
      this.distance = minPhysDistance;

      // 2. Evaluasi apakah user berada di dalam radius salah satu kantor fisik yang AKTIF hari ini
      let matchedOffice = null;
      let matchedOfficeDistance = Infinity;

      activeLocationsToday.forEach(loc => {
        const isWfh = loc.is_wfh === 'ya' || loc.is_wfh === 'true' || loc.is_wfh === true;
        if (isWfh) return; // Lewati WFH dulu

        const d = Helper.calculateDistance(
          this.latitude, this.longitude,
          parseFloat(loc.office_lat), parseFloat(loc.office_lng)
        );

        if (d <= parseFloat(loc.radius)) {
          if (d < matchedOfficeDistance) {
            matchedOfficeDistance = d;
            matchedOffice = loc;
          }
        }
      });

      if (matchedOffice) {
        // User sukses terdeteksi berada di radius kantor fisik yang aktif hari ini!
        this.nearestLocation = matchedOffice;
        this.distance = matchedOfficeDistance;
        this.isValidRadius = true;
        this.geofenceError = '';
        return;
      }

      // 3. Jika tidak berada di radius kantor fisik aktif, cek apakah ada WFH yang aktif hari ini
      const activeWfh = activeLocationsToday.find(loc => {
        return loc.is_wfh === 'ya' || loc.is_wfh === 'true' || loc.is_wfh === true;
      });

      if (activeWfh) {
        // User berhak absen menggunakan mode WFH (Bebas Radius) hari ini!
        this.nearestLocation = activeWfh;
        // Tetap set distance ke kantor fisik terdekat agar UI menampilkan metrik jarak yang realistis
        this.distance = minPhysDistance;
        this.isValidRadius = true;
        this.geofenceError = `Mode WFH Aktif: Anda terhubung ke lokasi ${activeWfh.office_name} (Bebas Radius).`;
        return;
      }

      // 4. Jika tidak memenuhi semua di atas, user dilarang absen. Berikan alasan error yang paling informatif
      this.isValidRadius = false;
      
      if (physicallyClosest) {
        const activeDaysStr = physicallyClosest.active_days || 'Senin,Selasa,Rabu,Kamis,Jumat,Sabtu,Minggu';
        const activeDaysArr = activeDaysStr.split(',').map(d => d.trim());
        const isClosestActive = activeDaysArr.includes(currentDayName);

        if (!isClosestActive) {
          this.geofenceError = `Absensi tidak aktif hari ini (${currentDayName}). Hari aktif: ${activeDaysStr}.`;
        } else {
          this.geofenceError = ''; // Biarkan warning radius bawaan berjalan
        }
      } else {
        this.geofenceError = 'Anda berada di luar radius kantor dan tidak memiliki izin WFH aktif hari ini.';
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
        
        // Stop the camera preview stream to release device hardware, but KEEP the modal open for user review
        if (this.videoStream) {
          this.videoStream.getTracks().forEach(track => track.stop());
          this.videoStream = null;
        }
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

      Helper.showLoading('Memverifikasi lokasi GPS aktual Anda...');

      // Proteksi anti-fraud: Verifikasi lokasi instan tepat sebelum data absensi dikirim ke server
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 6000,
            maximumAge: 0
          });
        });

        const mockCheck = Helper.detectMockGPS(position);
        if (mockCheck.spoofed) {
          Helper.closeLoading();
          Helper.alert('Absensi Ditolak', mockCheck.reason, 'error');
          this.gpsError = mockCheck.reason;
          this.isValidRadius = false;
          return;
        }

        this.latitude = position.coords.latitude;
        this.longitude = position.coords.longitude;
        this.accuracy = position.coords.accuracy;
        
        // Evaluasi ulang jarak dan radius secara aktual
        this.evaluateProximity();
      } catch (err) {
        console.warn('Silent GPS verification timed out, fallback to locked state:', err);
      }

      if (!this.isValidRadius) {
        Helper.closeLoading();
        Helper.alert('Absensi Ditolak', 'Lokasi aktual Anda terdeteksi berada di luar radius kantor yang diizinkan!', 'error');
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
          const limitTime = (activeLoc && activeLoc.working_hour_start) ? (activeLoc.working_hour_start + ':00') : '08:00:00';
          const isLate = timeStr > limitTime;
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
          this.isCameraOpen = false; // Close the modal upon successful attendance logging!
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
