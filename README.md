# Panduan Setup & Deploy: Aplikasi Presensi Geolokasi PWA

Aplikasi **Presensi Geolokasi** ini adalah solusi sistem pencatatan kehadiran modern berbasis **Progressive Web App (PWA)**. Aplikasi ini sepenuhnya bersifat **serverless**, memanfaatkan kombinasi **GitHub Pages** (Frontend) dengan **Google Sheets** & **Google Apps Script** (Backend Database & API).

---

## 1. STRUKTUR DATABASE (GOOGLE SHEETS)

Buatlah sebuah Spreadsheet baru di Google Sheets dengan nama **"Database Presensi Geoloc"**, lalu buat **3 sheet (tab)** terpisah dengan nama kolom persis seperti berikut pada baris pertama:

### A. Sheet: `USERS`
| Kolom A | Kolom B | Kolom C | Kolom D | Kolom E | Kolom F |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `nama` | `username` | `password` | `role` | `status` |

*Silakan tambahkan data awal pada sheet `USERS` seperti berikut:*
- `USR-1000`, `Administrator Balisai`, `admin`, `admin123`, `admin`, `aktif`
- `USR-1001`, `John Doe Karyawan`, `user`, `user123`, `user`, `aktif`

### B. Sheet: `ABSENSI`
| Kolom A | Kolom B | Kolom C | Kolom D | Kolom E | Kolom F | Kolom G | Kolom H | Kolom I | Kolom J | Kolom K |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `user_id` | `nama` | `tanggal` | `jam_masuk` | `jam_pulang` | `latitude` | `longitude` | `jarak` | `selfie_url` | `status` |

### C. Sheet: `CONFIG`
| Kolom A | Kolom B | Kolom C | Kolom D | Kolom E |
| :--- | :--- | :--- | :--- | :--- |
| `location_id` | `office_name` | `office_lat` | `office_lng` | `radius` |

*Silakan tambahkan data lokasi kantor awal pada sheet `CONFIG` seperti berikut:*
- `LOC-01`, `Balisai HQ (Sanur)`, `-8.6705`, `115.2126`, `100`
- `LOC-02`, `Kampus Sudirman`, `-8.6582`, `115.2198`, `150`

---

## 2. KODE BACKEND (GOOGLE APPS SCRIPT)

Buka Google Sheets database Anda, pilih menu **Ekstensi** > **Apps Script**. Hapus semua kode default di dalam editor `Kode.gs`, kemudian salin dan tempel kode berikut seluruhnya:

```javascript
/**
 * GOOGLE APPS SCRIPT WEB APP API - BACKEND PRESENSI GEOLOCASI
 * 
 * Petunjuk:
 * 1. Tempel kode ini di Editor Google Apps Script spreadsheet Anda.
 * 2. Simpan project.
 * 3. Deploy sebagai Web App.
 * 4. Atur akses: "Anyone" (Siapa saja).
 */

const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

// CORS Response Helper
function makeJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Preflight CORS handler
function doOptions(e) {
  return makeJsonResponse({ success: true });
}

// Handler GET Requests (Membaca Data)
function doGet(e) {
  return handleRequest(e);
}

// Handler POST Requests (Menulis/Mengubah Data)
function doPost(e) {
  return handleRequest(e);
}

// Unified API Router
function handleRequest(e) {
  try {
    const action = e.parameter.action;
    let payload = {};

    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    switch (action) {
      case 'login':
        return login(ss, payload);
      case 'getUsers':
        return getUsers(ss);
      case 'createUser':
        return createUser(ss, payload);
      case 'updateUser':
        return updateUser(ss, payload);
      case 'deleteUser':
        return deleteUser(ss, payload);
      case 'getAttendance':
        return getAttendance(ss, payload);
      case 'saveAttendance':
        return saveAttendance(ss, payload);
      case 'getConfig':
        return getConfig(ss);
      case 'saveConfig':
        return saveConfig(ss, payload);
      case 'deleteLocation':
        return deleteLocation(ss, payload);
      default:
        return makeJsonResponse({ success: false, message: 'Aksi API tidak dikenali.' });
    }
  } catch (err) {
    return makeJsonResponse({ success: false, message: 'Kesalahan Server: ' + err.toString() });
  }
}

// Helper: Convert Sheet to JSON Object Array
function getSheetData(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const data = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    data.push(obj);
  }
  return data;
}

// ----------------------------------------------------
// API ENDPOINTS METHOD IMPLEMENTATIONS
// ----------------------------------------------------

function login(ss, payload) {
  const users = getSheetData(ss, 'USERS');
  const user = users.find(u => 
    u.username.toString().toLowerCase() === payload.username.toLowerCase() && 
    u.password.toString() === payload.password.toString()
  );

  if (user) {
    if (user.status !== 'aktif') {
      return makeJsonResponse({ success: false, message: 'Akun Anda dinonaktifkan oleh Admin.' });
    }
    return makeJsonResponse({ success: true, user: user });
  }
  return makeJsonResponse({ success: false, message: 'Username atau password salah!' });
}

function getUsers(ss) {
  const data = getSheetData(ss, 'USERS');
  return makeJsonResponse({ success: true, data: data });
}

function createUser(ss, payload) {
  const sheet = ss.getSheetByName('USERS');
  const users = getSheetData(ss, 'USERS');

  if (users.find(u => u.username.toLowerCase() === payload.username.toLowerCase())) {
    return makeJsonResponse({ success: false, message: 'Username sudah terdaftar!' });
  }

  const newId = 'USR-' + (1000 + users.length + 1);
  const newRow = [
    newId,
    payload.nama,
    payload.username,
    payload.password,
    payload.role || 'user',
    payload.status || 'aktif'
  ];

  sheet.appendRow(newRow);
  return makeJsonResponse({ success: true, message: 'User berhasil didaftarkan!', user_id: newId });
}

function updateUser(ss, payload) {
  const sheet = ss.getSheetByName('USERS');
  const data = sheet.getDataRange().getValues();
  const idColIdx = 0; // Kolom A

  for (let i = 1; i < data.length; i++) {
    if (data[i][idColIdx].toString() === payload.id.toString()) {
      sheet.getCell(i + 1, 2).setValue(payload.nama);
      sheet.getCell(i + 1, 3).setValue(payload.username);
      if (payload.password) {
        sheet.getCell(i + 1, 4).setValue(payload.password);
      }
      sheet.getCell(i + 1, 5).setValue(payload.role);
      sheet.getCell(i + 1, 6).setValue(payload.status);
      return makeJsonResponse({ success: true, message: 'User berhasil diupdate!' });
    }
  }

  return makeJsonResponse({ success: false, message: 'User tidak ditemukan.' });
}

function deleteUser(ss, payload) {
  const sheet = ss.getSheetByName('USERS');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === payload.id.toString()) {
      sheet.deleteRow(i + 1);
      return makeJsonResponse({ success: true, message: 'User berhasil dihapus!' });
    }
  }
  return makeJsonResponse({ success: false, message: 'User tidak ditemukan.' });
}

function getConfig(ss) {
  const data = getSheetData(ss, 'CONFIG');
  return makeJsonResponse({ success: true, data: data });
}

function saveConfig(ss, payload) {
  const sheet = ss.getSheetByName('CONFIG');
  const data = sheet.getDataRange().getValues();
  
  // Periksa apakah lokasi sudah ada
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === payload.location_id.toString()) {
      sheet.getCell(i + 1, 2).setValue(payload.office_name);
      sheet.getCell(i + 1, 3).setValue(payload.office_lat);
      sheet.getCell(i + 1, 4).setValue(payload.office_lng);
      sheet.getCell(i + 1, 5).setValue(payload.radius);
      return makeJsonResponse({ success: true, message: 'Konfigurasi lokasi berhasil diupdate!' });
    }
  }

  // Jika tidak ditemukan, buat baru
  sheet.appendRow([
    payload.location_id,
    payload.office_name,
    payload.office_lat,
    payload.office_lng,
    payload.radius
  ]);
  return makeJsonResponse({ success: true, message: 'Lokasi cabang berhasil ditambahkan!' });
}

function deleteLocation(ss, payload) {
  const sheet = ss.getSheetByName('CONFIG');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === payload.location_id.toString()) {
      sheet.deleteRow(i + 1);
      return makeJsonResponse({ success: true, message: 'Lokasi berhasil dihapus!' });
    }
  }
  return makeJsonResponse({ success: false, message: 'Lokasi tidak ditemukan.' });
}

function getAttendance(ss, payload) {
  let data = getSheetData(ss, 'ABSENSI');
  if (payload && payload.user_id) {
    data = data.filter(d => d.user_id.toString() === payload.user_id.toString());
  }
  return makeJsonResponse({ success: true, data: data });
}

function saveAttendance(ss, payload) {
  const sheet = ss.getSheetByName('ABSENSI');
  const data = sheet.getDataRange().getValues();

  // Unggah foto selfie ke Google Drive dan dapatkan tautan publiknya
  let driveFileUrl = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'; // default fallback
  if (payload.selfie_url && payload.selfie_url.startsWith('data:image')) {
    driveFileUrl = uploadSelfieToDrive(payload.selfie_url, payload.nama);
  }

  // Jika ini adalah absen pulang, update baris presensi hari ini yang sudah ada
  if (payload.isClockOut) {
    for (let i = 1; i < data.length; i++) {
      const matchUserId = data[i][1].toString() === payload.user_id.toString();
      const matchDate = data[i][3].toString() === payload.tanggal.toString();
      
      if (matchUserId && matchDate) {
        sheet.getCell(i + 1, 6).setValue(payload.jam_pulang); // Jam Pulang (Kolom F)
        sheet.getCell(i + 1, 11).setValue('Pulang'); // Status (Kolom K)
        
        return makeJsonResponse({ success: true, message: 'Absensi pulang berhasil disimpan!' });
      }
    }
  }

  // Buat Log Baru (Presensi Masuk)
  const newAttId = 'ATT-' + String(data.length).padStart(4, '0');
  const newRow = [
    newAttId,
    payload.user_id,
    payload.nama,
    payload.tanggal,
    payload.jam_masuk,
    '', // jam pulang masih kosong
    payload.latitude,
    payload.longitude,
    payload.jarak,
    driveFileUrl,
    payload.status
  ];

  sheet.appendRow(newRow);
  return makeJsonResponse({ success: true, message: 'Absensi masuk berhasil disimpan!' });
}

/**
 * HELPER: Mengunggah base64 image ke folder Google Drive dan menjadikannya link public
 */
function uploadSelfieToDrive(base64Str, employeeName) {
  try {
    const parentFolder = DriveApp.getRootFolder();
    let folder;
    const folderName = "PresensiSelfies";
    const folders = parentFolder.getFoldersByName(folderName);

    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = parentFolder.createFolder(folderName);
    }

    // Ekstrak data base64
    const base64Data = base64Str.split(',')[1];
    const decoded = Utilities.base64Decode(base64Data);
    
    const formattedDate = Utilities.formatDate(new Date(), "GMT+8", "yyyyMMdd-HHmmss");
    const fileName = "Selfie_" + employeeName.replace(/\s+/g, "_") + "_" + formattedDate + ".jpg";
    
    const blob = Utilities.newBlob(decoded, "image/jpeg", fileName);
    const file = folder.createFile(blob);

    // Buka akses file agar dapat dilihat public via Link
    file.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);
    
    // Trik mendapatkan link direct-view gambar
    return "https://drive.google.com/uc?export=view&id=" + file.getId();
  } catch (err) {
    Logger.log("Drive Upload Error: " + err.toString());
    return "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";
  }
}
```

---

## 3. LANGKAH DEPLOY GOOGLE APPS SCRIPT (WEB APP)

Untuk menjadikan script di atas sebagai API Endpoint PWA Anda:

1. Di editor Apps Script, klik tombol **Terapkan (Deploy)** di pojok kanan atas > pilih **Penerapan Baru (New deployment)**.
2. Klik ikon roda gigi pengaturan di samping "Pilih tipe" > pilih **Aplikasi Web (Web App)**.
3. Konfigurasikan pengaturannya:
   - **Deskripsi**: *Presensi Geoloc PWA API v1.2*
   - **Jalankan sebagai (Execute as)**: **Saya (Me / Email Anda)**
   - **Siapa yang memiliki akses (Who has access)**: **Siapa saja (Anyone)**
4. Klik **Terapkan (Deploy)**.
5. Anda akan diminta untuk memberikan izin keamanan. Klik **Beri akses (Authorize Access)**, pilih akun Google Anda, klik **Lanjutan (Advanced)** di kiri bawah, pilih **Buka Presensi (tidak aman)**, lalu klik **Izinkan (Allow)**.
6. Salin tautan **URL Aplikasi Web** yang diberikan (misalnya `https://script.google.com/macros/s/AKfycb.../exec`).
7. Tautan URL ini adalah API Endpoint yang siap digunakan!

---

## 4. MENYAMBUNGKAN FRONTEND KE BACKEND GOOGLE SHEET

Setelah mendapatkan URL Aplikasi Web dari langkah di atas:

1. Jalankan aplikasi frontend PWA (buka `index.html` di browser Anda).
2. Secara default, aplikasi berada dalam **Demo / Mock Mode** (ada banner kuning di atas halaman login).
3. Klik tombol **Gear (Settings)** di bagian pojok kanan bawah halaman login.
4. Tempelkan URL Google Apps Script Web App Anda ke dalam kotak textarea yang tersedia.
5. Klik tombol **Simpan Koneksi**.
6. Halaman akan dimuat ulang. Banner kuning demo akan hilang dan berganti menjadi banner hijau **"Terkoneksi ke Google Sheets Backend"**!
7. Selesai! Sekarang semua aktivitas login, GPS, selfie, CRUD user, konfigurasi radius, dan ekspor laporan terhubung langsung secara real-time ke spreadsheet Anda!

---

## 5. HOSTING DI GITHUB PAGES (GRATIS)

Karena aplikasi ini 100% frontend static (PWA), Anda dapat menghostingnya langsung di GitHub Pages secara gratis tanpa backend server:

1. Buat sebuah repositori baru di GitHub dengan nama bebas (misalnya `presensi-geoloc`).
2. Unggah seluruh file proyek ini ke dalam repositori tersebut:
   ```
   index.html
   dashboard.html
   admin.html
   laporan.html
   manifest.json
   service-worker.js
   assets/
   ```
3. Buka tab **Settings** repositori Anda di GitHub.
4. Di bilah sisi kiri, klik menu **Pages**.
5. Pada bagian **Build and deployment** > **Source**, pilih **Deploy from a branch**.
6. Pada dropdown branch di bawahnya, pilih **main** (atau **master**) dan folder **/(root)**, lalu klik **Save**.
7. Tunggu sekitar 1-2 menit. GitHub akan mempublikasikan situs Anda pada tautan HTTPS seperti: `https://username-github.github.io/presensi-geoloc/`.
8. Buka tautan tersebut melalui ponsel cerdas Android Anda!

---

## 6. CARA MENGINSTAL PWA DI ANDROID (CHROME)

Agar aplikasi dapat berjalan layaknya aplikasi native Android lengkap dengan splash-screen dan lencana ikon tanpa navigasi browser:

1. Buka browser **Google Chrome** di ponsel Android Anda.
2. Masukkan alamat URL situs GitHub Pages Anda (misal `https://username.github.io/presensi-geoloc/`).
3. Ketika halaman login terbuka, Chrome akan memicu petunjuk installasi otomatis. Jika tidak, ketuk ikon **Titik Tiga** di sudut kanan atas Chrome.
4. Ketuk opsi **Tambahkan ke Layar Utama (Add to Home Screen)** atau **Instal Aplikasi (Install App)**.
5. Konfirmasi pemasangan dengan mengetuk tombol **Instal**.
6. Tunggu beberapa detik hingga proses selesai. Sekarang ikon aplikasi **Presensi Geoloc** akan muncul di laci aplikasi ponsel Android Anda.
7. Buka aplikasi tersebut dari layar utama. Aplikasi akan berjalan layar penuh (fullscreen standalone) dengan kinerja sangat cepat dan responsif!
