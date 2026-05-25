/**
 * API Service Client - Axios Adapter Pattern
 */

const ApiService = {
  /**
   * Universal fetch handler that handles Mock vs Real API routing
   */
  async request(action, method = 'POST', data = {}) {
    const appStore = Alpine.store('app');
    
    if (appStore.isMockMode) {
      return this.handleMockRequest(action, method, data);
    }

    try {
      // Build Google Apps Script Web App URL with action query param
      const url = `${appStore.apiUrl}?action=${action}`;
      
      // Google Apps Script requires CORS redirects, simple requests work best.
      // We send JSON as a string payload using text/plain to avoid preflight issues in GAS
      const response = await axios({
        method: 'POST', // Use POST for writing and reading with body in GAS
        url: url,
        data: JSON.stringify(data),
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        }
      });

      if (response.data && typeof response.data === 'object') {
        return response.data;
      }
      
      return { success: false, message: 'Format response backend tidak valid.' };
    } catch (error) {
      console.error(`API Error [${action}]:`, error);
      return {
        success: false,
        message: `Gagal menghubungi backend: ${error.message || 'Network Error'}`
      };
    }
  },

  /**
   * Fallback localStorage database handler for Demo Mode
   */
  async handleMockRequest(action, method, data) {
    // Delay simulation for natural loading UI
    await new Promise(resolve => setTimeout(resolve, 800));

    const getUsersFromStorage = () => JSON.parse(localStorage.getItem('presensi_users') || '[]');
    const saveUsersToStorage = (users) => localStorage.setItem('presensi_users', JSON.stringify(users));
    const getAttendanceFromStorage = () => JSON.parse(localStorage.getItem('presensi_absensi') || '[]');
    const saveAttendanceToStorage = (logs) => localStorage.setItem('presensi_absensi', JSON.stringify(logs));
    const getConfigFromStorage = () => JSON.parse(localStorage.getItem('presensi_config') || '[]');
    const saveConfigToStorage = (configs) => localStorage.setItem('presensi_config', JSON.stringify(configs));

    switch (action) {
      case 'login': {
        const users = getUsersFromStorage();
        const user = users.find(u => 
          u.username.toLowerCase() === data.username.toLowerCase() && 
          u.password === data.password
        );
        if (user) {
          if (user.status !== 'aktif') {
            return { success: false, message: 'Akun Anda telah dinonaktifkan oleh Admin.' };
          }
          return { success: true, message: 'Login berhasil (Mock Mode)', user };
        }
        return { success: false, message: 'Username atau password salah!' };
      }

      case 'getUsers': {
        return { success: true, data: getUsersFromStorage() };
      }

      case 'createUser': {
        const users = getUsersFromStorage();
        if (users.find(u => u.username.toLowerCase() === data.username.toLowerCase())) {
          return { success: false, message: 'Username sudah terdaftar!' };
        }
        const newUser = {
          id: 'USR-' + (1000 + users.length + 1),
          nama: data.nama,
          username: data.username,
          password: data.password,
          role: data.role || 'user',
          status: data.status || 'aktif'
        };
        users.push(newUser);
        saveUsersToStorage(users);
        return { success: true, message: 'User berhasil dibuat!', data: newUser };
      }

      case 'updateUser': {
        const users = getUsersFromStorage();
        const idx = users.findIndex(u => u.id === data.id);
        if (idx === -1) return { success: false, message: 'User tidak ditemukan.' };
        
        users[idx] = { ...users[idx], ...data };
        saveUsersToStorage(users);
        return { success: true, message: 'User berhasil diupdate!', data: users[idx] };
      }

      case 'deleteUser': {
        const users = getUsersFromStorage();
        const filtered = users.filter(u => u.id !== data.id);
        if (users.length === filtered.length) {
          return { success: false, message: 'User tidak ditemukan.' };
        }
        saveUsersToStorage(filtered);
        return { success: true, message: 'User berhasil dihapus!' };
      }

      case 'getAttendance': {
        let logs = getAttendanceFromStorage();
        if (data.user_id) {
          logs = logs.filter(l => l.user_id === data.user_id);
        }
        return { success: true, data: logs };
      }

      case 'saveAttendance': {
        const logs = getAttendanceFromStorage();
        
        // Generate random selfie URL if it's base64 (mock uploading)
        let finalSelfieUrl = data.selfie_url;
        if (finalSelfieUrl && finalSelfieUrl.startsWith('data:image')) {
          finalSelfieUrl = 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&q=80&w=200';
        }

        const newLog = {
          id: 'ATT-' + String(logs.length + 1).padStart(3, '0'),
          user_id: data.user_id,
          nama: data.nama,
          tanggal: data.tanggal,
          jam_masuk: data.jam_masuk,
          jam_pulang: data.jam_pulang || '',
          latitude: data.latitude,
          longitude: data.longitude,
          jarak: data.jarak,
          selfie_url: finalSelfieUrl,
          status: data.status
        };

        // If clocking out, we update an existing log for today if it exists
        if (data.isClockOut) {
          const todayLogIdx = logs.findIndex(l => l.user_id === data.user_id && l.tanggal === data.tanggal);
          if (todayLogIdx !== -1) {
            logs[todayLogIdx].jam_pulang = data.jam_pulang;
            logs[todayLogIdx].status = 'Pulang';
            saveAttendanceToStorage(logs);
            return { success: true, message: 'Absensi pulang berhasil disimpan!', data: logs[todayLogIdx] };
          }
        }

        logs.push(newLog);
        saveAttendanceToStorage(logs);
        return { success: true, message: 'Absensi masuk berhasil disimpan!', data: newLog };
      }

      case 'getConfig': {
        return { success: true, data: getConfigFromStorage() };
      }

      case 'saveConfig': {
        let configs = getConfigFromStorage();
        
        if (data.location_id) {
          const idx = configs.findIndex(c => c.location_id === data.location_id);
          if (idx !== -1) {
            configs[idx] = { ...configs[idx], ...data };
          } else {
            configs.push(data);
          }
        } else {
          // Fallback multi overwrite
          configs = data;
        }

        saveConfigToStorage(configs);
        return { success: true, message: 'Konfigurasi lokasi berhasil disimpan!' };
      }
      
      case 'deleteLocation': {
        const configs = getConfigFromStorage();
        const filtered = configs.filter(c => c.location_id !== data.location_id);
        saveConfigToStorage(filtered);
        return { success: true, message: 'Lokasi berhasil dihapus!' };
      }

      case 'uploadSelfie': {
        // Return dummy preview url
        return { 
          success: true, 
          url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200' 
        };
      }

      default:
        return { success: false, message: 'Aksi database tidak dikenali.' };
    }
  },

  // Concrete client helpers mapped to actions
  login(username, password) {
    return this.request('login', 'POST', { username, password });
  },

  getUsers() {
    return this.request('getUsers', 'POST');
  },

  createUser(userData) {
    return this.request('createUser', 'POST', userData);
  },

  updateUser(userData) {
    return this.request('updateUser', 'POST', userData);
  },

  deleteUser(id) {
    return this.request('deleteUser', 'POST', { id });
  },

  getAttendance(user_id = '') {
    return this.request('getAttendance', 'POST', { user_id });
  },

  saveAttendance(attendanceData) {
    return this.request('saveAttendance', 'POST', attendanceData);
  },

  getConfig() {
    return this.request('getConfig', 'POST');
  },

  saveConfig(locationData) {
    return this.request('saveConfig', 'POST', locationData);
  },
  
  deleteLocation(location_id) {
    return this.request('deleteLocation', 'POST', { location_id });
  },

  uploadSelfie(base64Image) {
    return this.request('uploadSelfie', 'POST', { image: base64Image });
  }
};

window.ApiService = ApiService;
