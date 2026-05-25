/**
 * Authentication Management Script
 */

const Auth = {
  /**
   * Get currently logged-in user profile
   */
  getUser() {
    const session = localStorage.getItem('presensi_user_session');
    return session ? JSON.parse(session) : null;
  },

  /**
   * Check if a user session is active
   */
  isLoggedIn() {
    return this.getUser() !== null;
  },

  /**
   * Check current user role
   */
  getRole() {
    const user = this.getUser();
    return user ? user.role : null;
  },

  /**
   * Log out of the system and flush session cache
   */
  logout() {
    localStorage.removeItem('presensi_user_session');
    
    // Unless checked "Remember Me", clear other credentials too
    if (localStorage.getItem('presensi_remember') !== 'true') {
      localStorage.removeItem('presensi_saved_username');
    }

    Helper.Toast.fire({
      icon: 'success',
      title: 'Logout berhasil. Sampai jumpa kembali!'
    });

    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1200);
  },

  /**
   * Protect private views. Redirects immediately if unauthorized.
   * @param {string} requiredRole 'user' or 'admin'
   */
  checkProtection(requiredRole = '') {
    const user = this.getUser();

    if (!user) {
      // User is completely unauthenticated, direct to login
      window.location.href = 'index.html';
      return false;
    }

    if (user.status !== 'aktif') {
      // Handle deactivated profiles
      this.logout();
      return false;
    }

    if (requiredRole && user.role !== requiredRole) {
      // Role unauthorized: regular users can't access admin
      if (user.role === 'user') {
        window.location.href = 'dashboard.html';
      } else if (user.role === 'admin') {
        window.location.href = 'admin.html';
      }
      return false;
    }

    return true;
  }
};

document.addEventListener('alpine:init', () => {
  Alpine.data('authData', () => ({
    username: localStorage.getItem('presensi_saved_username') || '',
    password: '',
    rememberMe: localStorage.getItem('presensi_remember') === 'true',
    loading: false,
    currentUser: null,

    init() {
      this.currentUser = Auth.getUser();
    },

    async handleLogin() {
      if (!this.username || !this.password) {
        Helper.alert('Peringatan', 'Harap isi semua kolom login!', 'warning');
        return;
      }

      this.loading = true;
      Helper.showLoading('Memverifikasi akun Anda...');

      try {
        const appStore = Alpine.store('app');
        let result;

        if (appStore.isMockMode) {
          // Mock mode local validation
          const users = JSON.parse(localStorage.getItem('presensi_users') || '[]');
          const matchedUser = users.find(u => 
            u.username.toLowerCase() === this.username.toLowerCase() && 
            u.password === this.password
          );

          if (matchedUser) {
            if (matchedUser.status !== 'aktif') {
              result = { success: false, message: 'Akun Anda dinonaktifkan oleh administrator.' };
            } else {
              result = { success: true, user: matchedUser };
            }
          } else {
            result = { success: false, message: 'Username atau password salah!' };
          }
        } else {
          // Call live GAS API
          result = await ApiService.login(this.username, this.password);
        }

        Helper.closeLoading();

        if (result.success) {
          // Save session
          localStorage.setItem('presensi_user_session', JSON.stringify(result.user));

          // Remember Credentials logic
          if (this.rememberMe) {
            localStorage.setItem('presensi_remember', 'true');
            localStorage.setItem('presensi_saved_username', this.username);
          } else {
            localStorage.removeItem('presensi_remember');
            localStorage.removeItem('presensi_saved_username');
          }

          Helper.Toast.fire({
            icon: 'success',
            title: `Selamat datang, ${result.user.nama}!`
          });

          // Route to matching landing console
          setTimeout(() => {
            if (result.user.role === 'admin') {
              window.location.href = 'admin.html';
            } else {
              window.location.href = 'dashboard.html';
            }
          }, 1000);
        } else {
          Helper.alert('Login Gagal', result.message || 'Akun tidak cocok.', 'error');
        }
      } catch (err) {
        console.error(err);
        Helper.closeLoading();
        Helper.alert('Kesalahan Sistem', 'Tidak dapat menghubungi server. Pastikan Anda online atau coba Mock Mode.', 'error');
      } finally {
        this.loading = false;
      }
    },

    handleLogout() {
      Auth.logout();
    }
  }));
});

window.Auth = Auth;
