/**
 * Admin Panel State and Action Handlers
 */

document.addEventListener('alpine:init', () => {
  Alpine.data('adminData', () => ({
    // Statistics variables
    totalUsers: 0,
    presentToday: 0,
    lateToday: 0,
    absentToday: 0,
    attendanceRate: 0,
    
    // User CRUD states
    users: [],
    loadingUsers: false,
    showUserModal: false,
    modalTitle: 'Tambah User Baru',
    
    // Form fields for User
    userId: '',
    nama: '',
    username: '',
    password: '',
    role: 'user',
    status: 'aktif',

    // Location Config states
    locations: [],
    loadingConfig: false,
    showLocationModal: false,
    locModalTitle: 'Tambah Lokasi Baru',
    
    // Form fields for Location
    locationId: '',
    officeName: '',
    officeLat: -8.6705,
    officeLng: 115.2126,
    radius: 100,
    assignedUsers: ['*'],
    activeDays: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'],
    isWfh: 'tidak',
    activeTab: 'dashboard',
    requiredPhoto: 'ya',
    workingHourStart: '08:00',
    workingHourEnd: '17:00',
    
    // Picker map references
    pickerMap: null,
    pickerMarker: null,
    pickerCircle: null,

    init() {
      // Route Lock check
      if (!Auth.checkProtection('admin')) return;

      // Seed Initial Setup data
      this.refreshAdminData();

      // Listen for pull to refresh updates
      window.addEventListener('refresh-app-data', () => {
        this.refreshAdminData();
      });
    },

    async refreshAdminData() {
      this.loadingUsers = true;
      try {
        await Promise.all([
          this.fetchUsers(),
          this.fetchLocations(),
          this.calculateMetrics()
        ]);
      } catch (err) {
        console.error('Error refreshing admin details:', err);
      } finally {
        this.loadingUsers = false;
      }
    },

    async fetchUsers() {
      const res = await ApiService.getUsers();
      if (res.success) {
        this.users = res.data;
        this.totalUsers = res.data.length;
      }
    },

    async fetchLocations() {
      this.loadingConfig = true;
      try {
        const res = await ApiService.getConfig();
        if (res.success) {
          this.locations = res.data;
        }
      } catch (err) {
        console.error(err);
      } finally {
        this.loadingConfig = false;
      }
    },

    async calculateMetrics() {
      const attRes = await ApiService.getAttendance();
      if (attRes.success) {
        const todayStr = Helper.formatDate(new Date());
        
        // Filter attendance logged today
        const todayLogs = attRes.data.filter(log => log.tanggal === todayStr);
        
        // Get unique users that clocked in today
        const uniquePresents = [...new Set(todayLogs.map(l => l.user_id))];
        this.presentToday = uniquePresents.length;
        
        // Tardiness counts
        this.lateToday = todayLogs.filter(l => l.status === 'Terlambat').length;
        
        // Computations
        this.absentToday = Math.max(0, this.totalUsers - this.presentToday);
        this.attendanceRate = this.totalUsers > 0 
          ? Math.round((this.presentToday / this.totalUsers) * 100) 
          : 0;
      }
    },

    /**
     * User Account Management Actions
     */
    openAddUser() {
      this.modalTitle = 'Tambah User Baru';
      this.userId = '';
      this.nama = '';
      this.username = '';
      this.password = '';
      this.role = 'user';
      this.status = 'aktif';
      this.showUserModal = true;
    },

    openEditUser(user) {
      this.modalTitle = 'Edit Profile User';
      this.userId = user.id;
      this.nama = user.nama;
      this.username = user.username;
      this.password = user.password;
      this.role = user.role;
      this.status = user.status;
      this.showUserModal = true;
    },

    async saveUser() {
      if (!this.nama || !this.username || (!this.userId && !this.password)) {
        Helper.alert('Peringatan', 'Harap isi semua kolom wajib!', 'warning');
        return;
      }

      Helper.showLoading('Menyimpan informasi user...');

      try {
        let res;
        const payload = {
          nama: this.nama,
          username: this.username,
          password: this.password,
          role: this.role,
          status: this.status
        };

        if (this.userId) {
          // Edit
          payload.id = this.userId;
          res = await ApiService.updateUser(payload);
        } else {
          // Create
          res = await ApiService.createUser(payload);
        }

        Helper.closeLoading();

        if (res.success) {
          Helper.alert('Berhasil!', res.message, 'success');
          this.showUserModal = false;
          await this.refreshAdminData();
        } else {
          Helper.alert('Gagal', res.message, 'error');
        }
      } catch (err) {
        console.error(err);
        Helper.closeLoading();
        Helper.alert('Kesalahan', 'Gagal memproses tindakan database.', 'error');
      }
    },

    async deleteUser(user) {
      const confirm = await Swal.fire({
        title: 'Hapus User?',
        text: `Apakah Anda yakin ingin menghapus user ${user.nama}? Riwayat absensi tidak akan terpengaruh.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Ya, Hapus',
        cancelButtonText: 'Batal',
        customClass: {
          popup: 'rounded-2xl glass-panel text-slate-800 dark:text-slate-100',
          confirmButton: 'px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-medium transition mr-2',
          cancelButton: 'px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium transition'
        },
        buttonsStyling: false
      });

      if (!confirm.isConfirmed) return;

      Helper.showLoading('Menghapus user...');

      try {
        const res = await ApiService.deleteUser(user.id);
        Helper.closeLoading();

        if (res.success) {
          Helper.alert('Dihapus!', res.message, 'success');
          await this.refreshAdminData();
        } else {
          Helper.alert('Gagal', res.message, 'error');
        }
      } catch (err) {
        console.error(err);
        Helper.closeLoading();
        Helper.alert('Kesalahan', 'Gagal menghapus user.', 'error');
      }
    },

    async resetPassword(user) {
      const confirm = await Swal.fire({
        title: 'Reset Password?',
        text: `Password untuk user ${user.nama} akan dikembalikan menjadi default 'user123'. Lanjutkan?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Ya, Reset',
        cancelButtonText: 'Batal',
        customClass: {
          popup: 'rounded-2xl glass-panel text-slate-800 dark:text-slate-100',
          confirmButton: 'px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition mr-2',
          cancelButton: 'px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium transition'
        },
        buttonsStyling: false
      });

      if (!confirm.isConfirmed) return;

      Helper.showLoading('Mereset password...');

      try {
        const payload = { ...user, password: 'user123' };
        const res = await ApiService.updateUser(payload);
        
        Helper.closeLoading();

        if (res.success) {
          Helper.alert('Reset Berhasil!', 'Password diubah menjadi user123.', 'success');
          await this.fetchUsers();
        } else {
          Helper.alert('Gagal', res.message, 'error');
        }
      } catch (err) {
        console.error(err);
        Helper.closeLoading();
        Helper.alert('Kesalahan', 'Gagal mereset password.', 'error');
      }
    },

    /**
     * Location Management Form Actions
     */
    openAddLocation() {
      this.locModalTitle = 'Tambah Lokasi Kantor';
      this.locationId = '';
      this.officeName = '';
      this.officeLat = -8.6705;
      this.officeLng = 115.2126;
      this.radius = 100;
      this.assignedUsers = ['*'];
      this.activeDays = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
      this.isWfh = 'tidak';
      this.requiredPhoto = 'ya';
      this.workingHourStart = '08:00';
      this.workingHourEnd = '17:00';
      
      this.showLocationModal = true;
      this.initLocationPickerMap();
    },

    openEditLocation(loc) {
      this.locModalTitle = 'Edit Parameter Lokasi';
      this.locationId = loc.location_id;
      this.officeName = loc.office_name;
      this.officeLat = parseFloat(loc.office_lat);
      this.officeLng = parseFloat(loc.office_lng);
      this.radius = parseInt(loc.radius);
      
      const assigned = loc.assigned_users || '*';
      this.assignedUsers = (assigned === '*' || assigned === '') ? ['*'] : assigned.split(',');
      
      const days = loc.active_days || 'Senin,Selasa,Rabu,Kamis,Jumat,Sabtu,Minggu';
      this.activeDays = days.split(',');
      this.isWfh = loc.is_wfh || 'tidak';
      this.requiredPhoto = loc.required_photo || 'ya';
      this.workingHourStart = loc.working_hour_start || '08:00';
      this.workingHourEnd = loc.working_hour_end || '17:00';
      
      this.showLocationModal = true;
      this.initLocationPickerMap();
    },

    /**
     * Render and wire map inputs with draggable picker marker
     */
    initLocationPickerMap() {
      setTimeout(() => {
        const pickerEl = document.getElementById('pickerMap');
        if (!pickerEl) return;

        // Reset elements if redrawn
        if (pickerEl._leaflet_id) {
          pickerEl.innerHTML = '';
          pickerEl._leaflet_id = null;
        }

        const mapPicker = L.map('pickerMap', { attributionControl: false }).setView([this.officeLat, this.officeLng], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapPicker);
        
        this.pickerMap = mapPicker;

        // Visual radius circle
        const circle = L.circle([this.officeLat, this.officeLng], {
          color: '#3b82f6',
          fillColor: '#60a5fa',
          fillOpacity: 0.15,
          radius: this.radius
        }).addTo(mapPicker);
        
        this.pickerCircle = circle;

        // Draggable pin marker
        const marker = L.marker([this.officeLat, this.officeLng], {
          draggable: true
        }).addTo(mapPicker);
        
        this.pickerMarker = marker;

        // Synchronize on drag
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          this.officeLat = parseFloat(pos.lat.toFixed(6));
          this.officeLng = parseFloat(pos.lng.toFixed(6));
          circle.setLatLng(pos);
        });

        // Watch Alpine radius input changes
        this.$watch('radius', (newRad) => {
          circle.setRadius(parseInt(newRad) || 10);
        });

        // Click map to snap pin marker
        mapPicker.on('click', (e) => {
          marker.setLatLng(e.latlng);
          circle.setLatLng(e.latlng);
          this.officeLat = parseFloat(e.latlng.lat.toFixed(6));
          this.officeLng = parseFloat(e.latlng.lng.toFixed(6));
        });
      }, 350);
    },

    detectMyLocation() {
      if (!navigator.geolocation) {
        Helper.alert('Tidak Didukung', 'Browser Anda tidak mendukung Geolokasi.', 'error');
        return;
      }

      Helper.showLoading('Mendeteksi lokasi GPS Anda...');

      navigator.geolocation.getCurrentPosition(
        (position) => {
          Helper.closeLoading();
          const lat = parseFloat(position.coords.latitude.toFixed(6));
          const lng = parseFloat(position.coords.longitude.toFixed(6));

          this.officeLat = lat;
          this.officeLng = lng;

          const latlng = L.latLng(lat, lng);
          if (this.pickerMarker) this.pickerMarker.setLatLng(latlng);
          if (this.pickerCircle) this.pickerCircle.setLatLng(latlng);
          if (this.pickerMap) this.pickerMap.setView(latlng, 16);

          Helper.alert('Lokasi Terdeteksi', `Berhasil memetakan koordinat Anda: ${lat}, ${lng}`, 'success');
        },
        (error) => {
          Helper.closeLoading();
          console.error(error);
          Helper.alert('Gagal Geolokasi', 'Tidak dapat mendeteksi lokasi Anda. Pastikan GPS aktif dan izin lokasi diberikan.', 'error');
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    },

    async saveLocation() {
      const isWfhActive = this.isWfh === 'ya';

      if (isWfhActive) {
        this.officeLat = this.officeLat !== '' && this.officeLat !== null && this.officeLat !== undefined ? parseFloat(this.officeLat) : 0;
        this.officeLng = this.officeLng !== '' && this.officeLng !== null && this.officeLng !== undefined ? parseFloat(this.officeLng) : 0;
        this.radius = this.radius ? parseInt(this.radius) : 999999;
      }

      const isLatEmpty = this.officeLat === '' || this.officeLat === null || this.officeLat === undefined;
      const isLngEmpty = this.officeLng === '' || this.officeLng === null || this.officeLng === undefined;
      const isRadiusEmpty = !this.radius;

      if (!this.officeName || (!isWfhActive && (isLatEmpty || isLngEmpty || isRadiusEmpty))) {
        Helper.alert('Peringatan', 'Harap isi semua koordinat wajib!', 'warning');
        return;
      }

      Helper.showLoading('Menyimpan konfigurasi lokasi...');

      try {
        const payload = {
          location_id: this.locationId || 'LOC-' + String(this.locations.length + 1).padStart(2, '0'),
          office_name: this.officeName,
          office_lat: this.officeLat,
          office_lng: this.officeLng,
          radius: parseInt(this.radius),
          assigned_users: this.assignedUsers.includes('*') || this.assignedUsers.length === 0 ? '*' : this.assignedUsers.join(','),
          active_days: this.activeDays.length === 0 ? 'Senin,Selasa,Rabu,Kamis,Jumat,Sabtu,Minggu' : this.activeDays.join(','),
          is_wfh: this.isWfh,
          required_photo: this.requiredPhoto,
          working_hour_start: this.workingHourStart,
          working_hour_end: this.workingHourEnd
        };

        const res = await ApiService.saveConfig(payload);
        
        Helper.closeLoading();

        if (res.success) {
          Helper.alert('Konfigurasi Disimpan!', res.message, 'success');
          this.showLocationModal = false;
          await this.refreshAdminData();
        } else {
          Helper.alert('Gagal', res.message, 'error');
        }
      } catch (err) {
        console.error(err);
        Helper.closeLoading();
        Helper.alert('Kesalahan', 'Gagal memproses konfigurasi lokasi.', 'error');
      }
    },

    async deleteLocation(loc) {
      const confirm = await Swal.fire({
        title: 'Hapus Lokasi?',
        text: `Apakah Anda yakin ingin menghapus lokasi ${loc.office_name}?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Ya, Hapus',
        cancelButtonText: 'Batal',
        customClass: {
          popup: 'rounded-2xl glass-panel text-slate-800 dark:text-slate-100',
          confirmButton: 'px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-medium transition mr-2',
          cancelButton: 'px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium transition'
        },
        buttonsStyling: false
      });

      if (!confirm.isConfirmed) return;

      Helper.showLoading('Menghapus lokasi...');

      try {
        const res = await ApiService.deleteLocation(loc.location_id);
        Helper.closeLoading();

        if (res.success) {
          Helper.alert('Dihapus!', res.message, 'success');
          await this.refreshAdminData();
        } else {
          Helper.alert('Gagal', res.message, 'error');
        }
      } catch (err) {
        console.error(err);
        Helper.closeLoading();
        Helper.alert('Kesalahan', 'Gagal menghapus lokasi.', 'error');
      }
    }
  }));
});
