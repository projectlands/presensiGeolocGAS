/**
 * GOOGLE APPS SCRIPT WEB APP API - BACKEND PRESENSI GEOLOCASI
 * 
 * Petunjuk Setup Otomatis:
 * 1. Tempel kode ini di editor Google Apps Script spreadsheet Anda.
 * 2. Pilih fungsi 'setupSheets' pada dropdown di bagian atas editor, lalu klik tombol 'Run' (Jalankan).
 * 3. Semua sheet (USERS, ABSENSI, CONFIG) beserta kolom dan data awal akan dibuat otomatis!
 * 4. Deploy sebagai Web App dengan akses: "Anyone" (Siapa saja).
 */

const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

/**
 * FUNGSI SETUP OTOMATIS:
 * Jalankan fungsi ini pertama kali untuk membuat semua sheet dan struktur database
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Setup Sheet USERS
  let usersSheet = ss.getSheetByName('USERS');
  if (!usersSheet) {
    usersSheet = ss.insertSheet('USERS');
  }
  usersSheet.clear(); // Bersihkan jika ada konten sebelumnya
  usersSheet.appendRow(['id', 'nama', 'username', 'password', 'role', 'status']);
  // Seed Akun Default
  usersSheet.appendRow(['USR-1000', 'Administrator Balisai', 'admin', 'admin123', 'admin', 'aktif']);
  usersSheet.appendRow(['USR-1001', 'John Doe Staff', 'user', 'user123', 'user', 'aktif']);
  usersSheet.appendRow(['USR-1002', 'Alice Smith Staff', 'alice', 'user123', 'user', 'aktif']);

  // 2. Setup Sheet ABSENSI
  let absensiSheet = ss.getSheetByName('ABSENSI');
  if (!absensiSheet) {
    absensiSheet = ss.insertSheet('ABSENSI');
  }
  absensiSheet.clear();
  absensiSheet.appendRow(['id', 'user_id', 'nama', 'tanggal', 'jam_masuk', 'jam_pulang', 'latitude', 'longitude', 'jarak', 'selfie_url', 'status']);

  // 3. Setup Sheet CONFIG
  let configSheet = ss.getSheetByName('CONFIG');
  if (!configSheet) {
    configSheet = ss.insertSheet('CONFIG');
  }
  configSheet.clear();
  configSheet.appendRow(['location_id', 'office_name', 'office_lat', 'office_lng', 'radius', 'assigned_users', 'active_days', 'is_wfh', 'required_photo']);
  // Seed Lokasi Operasional Cabang
  configSheet.appendRow(['LOC-01', 'Balisai HQ (Sanur)', -8.6705, 115.2126, 100, '*', 'Senin,Selasa,Rabu,Kamis,Jumat', 'tidak', 'ya']);
  configSheet.appendRow(['LOC-02', 'Kampus IT Sudirman', -8.6582, 115.2198, 150, '*', 'Senin,Selasa,Rabu,Kamis,Jumat', 'tidak', 'ya']);
  configSheet.appendRow(['LOC-03', 'Cabang Renon Plaza', -8.6815, 115.2285, 50, 'USR-1001', 'Senin,Selasa,Rabu,Kamis', 'tidak', 'ya']);
  configSheet.appendRow(['LOC-04', 'Kerja Dari Rumah (WFH)', 0, 0, 999999, '*', 'Senin,Selasa,Rabu,Kamis,Jumat,Sabtu,Minggu', 'ya', 'ya']);
  
  // Hapus "Sheet1" bawaan Google Sheet jika kosong agar spreadsheet rapi
  let defaultSheet = ss.getSheetByName('Sheet1') || ss.getSheetByName('Sheet 1');
  if (defaultSheet && ss.getSheets().length > 3) {
    try {
      ss.deleteSheet(defaultSheet);
    } catch(e) {}
  }
  
  return "Setup Berhasil! Semua sheet database (USERS, ABSENSI, CONFIG) dan data awal dummy telah berhasil dibuat otomatis.";
}

// ----------------------------------------------------
// CORE API ROUTER GATEWAY
// ----------------------------------------------------

// CORS Response Helper
function makeJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Preflight CORS handler
function doOptions(e) {
  return makeJsonResponse({ success: true });
}

// Handler GET Requests
function doGet(e) {
  return handleRequest(e);
}

// Handler POST Requests
function doPost(e) {
  return handleRequest(e);
}

// Router Request
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
// IMPLEMENTASI METODE API ENDPOINTS
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
  const idColIdx = 0;

  for (let i = 1; i < data.length; i++) {
    if (data[i][idColIdx].toString() === payload.id.toString()) {
      sheet.getRange(i + 1, 2).setValue(payload.nama);
      sheet.getRange(i + 1, 3).setValue(payload.username);
      if (payload.password) {
        sheet.getRange(i + 1, 4).setValue(payload.password);
      }
      sheet.getRange(i + 1, 5).setValue(payload.role);
      sheet.getRange(i + 1, 6).setValue(payload.status);
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
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === payload.location_id.toString()) {
      sheet.getRange(i + 1, 2).setValue(payload.office_name);
      sheet.getRange(i + 1, 3).setValue(payload.office_lat);
      sheet.getRange(i + 1, 4).setValue(payload.office_lng);
      sheet.getRange(i + 1, 5).setValue(payload.radius);
      sheet.getRange(i + 1, 6).setValue(payload.assigned_users || '*');
      sheet.getRange(i + 1, 7).setValue(payload.active_days || 'Senin,Selasa,Rabu,Kamis,Jumat,Sabtu,Minggu');
      sheet.getRange(i + 1, 8).setValue(payload.is_wfh || 'tidak');
      sheet.getRange(i + 1, 9).setValue(payload.required_photo || 'ya');
      return makeJsonResponse({ success: true, message: 'Konfigurasi lokasi berhasil diupdate!' });
    }
  }

  sheet.appendRow([
    payload.location_id,
    payload.office_name,
    payload.office_lat,
    payload.office_lng,
    payload.radius,
    payload.assigned_users || '*',
    payload.active_days || 'Senin,Selasa,Rabu,Kamis,Jumat,Sabtu,Minggu',
    payload.is_wfh || 'tidak',
    payload.required_photo || 'ya'
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

  let driveFileUrl = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'; // default fallback
  if (payload.selfie_url && payload.selfie_url.startsWith('data:image')) {
    driveFileUrl = uploadSelfieToDrive(payload.selfie_url, payload.nama);
  }

  if (payload.isClockOut) {
    for (let i = 1; i < data.length; i++) {
      const matchUserId = data[i][1].toString() === payload.user_id.toString();
      const matchDate = data[i][3].toString() === payload.tanggal.toString();
      
      if (matchUserId && matchDate) {
        sheet.getRange(i + 1, 6).setValue(payload.jam_pulang); // Jam Pulang (Kolom F)
        sheet.getRange(i + 1, 11).setValue('Pulang'); // Status (Kolom K)
        
        return makeJsonResponse({ success: true, message: 'Absensi pulang berhasil disimpan!' });
      }
    }
  }

  const newAttId = 'ATT-' + String(data.length).padStart(4, '0');
  const newRow = [
    newAttId,
    payload.user_id,
    payload.nama,
    payload.tanggal,
    payload.jam_masuk,
    '', 
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

    const base64Data = base64Str.split(',')[1];
    const decoded = Utilities.base64Decode(base64Data);
    
    const formattedDate = Utilities.formatDate(new Date(), "GMT+8", "yyyyMMdd-HHmmss");
    const fileName = "Selfie_" + employeeName.replace(/\s+/g, "_") + "_" + formattedDate + ".jpg";
    
    const blob = Utilities.newBlob(decoded, "image/jpeg", fileName);
    const file = folder.createFile(blob);

    // Buka akses file agar public link viewer
    file.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);
    
    return "https://drive.google.com/uc?export=view&id=" + file.getId();
  } catch (err) {
    Logger.log("Drive Upload Error: " + err.toString());
    return "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";
  }
}
