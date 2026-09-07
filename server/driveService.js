const { google } = require('googleapis');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');

/**
 * Inisialisasi Google Drive Client menggunakan Service Account
 */
function getCredentialsData() {
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (rawKey) {
    if (rawKey.trim().startsWith('{')) {
      return JSON.parse(rawKey);
    } else if (fs.existsSync(rawKey.trim())) {
      return JSON.parse(fs.readFileSync(rawKey.trim(), 'utf8'));
    }
  }

  // Cek file credentials lokal di root folder jika ada
  const localFiles = ['service-account.json', 'credentials.json', 'service_account.json'];
  for (const file of localFiles) {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  }

  return null;
}

function getDriveClient() {
  try {
    const credentials = getCredentialsData();
    if (!credentials) return null;

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets'
      ]
    });

    return google.drive({ version: 'v3', auth });
  } catch (err) {
    console.error('[DriveService] Gagal inisialisasi Service Account:', err.message);
    return null;
  }
}

/**
 * Mencari atau membuat folder berdasarkan nama di dalam parent folder tertentu
 */
async function ensureFolder(drive, folderName, parentId) {
  const query = `name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '${parentId}' in parents`;
  
  const searchRes = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });

  if (searchRes.data.files && searchRes.data.files.length > 0) {
    return searchRes.data.files[0].id;
  }

  // Buat folder baru jika belum ada
  const createRes = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    },
    fields: 'id',
    supportsAllDrives: true
  });

  console.log(`[DriveService] Folder baru dibuat: "${folderName}" (ID: ${createRes.data.id}) di parent ${parentId}`);
  return createRes.data.id;
}

/**
 * Upload file media ke struktur folder Google Drive:
 * Nizhoot Media (DRIVE_ROOT_FOLDER_ID) / [Images|Videos] / [quiz_set] / [filename]
 */
async function uploadMediaToDrive({ buffer, filename, mimetype, quizSet = 'Default' }) {
  const rootFolderId = process.env.DRIVE_ROOT_FOLDER_ID;
  if (!rootFolderId) {
    throw new Error('DRIVE_ROOT_FOLDER_ID belum diset di file .env.');
  }

  const drive = getDriveClient();
  if (!drive) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY belum valid atau belum diset di .env.');
  }

  const isImage = mimetype.startsWith('image/');
  const isVideo = mimetype.startsWith('video/');

  if (!isImage && !isVideo) {
    throw new Error('Hanya file gambar atau video yang didukung untuk diunggah ke Google Drive.');
  }

  const categoryName = isImage ? 'Images' : 'Videos';

  // 1. Pastikan folder kategori (Images/Videos) ada di dalam root
  const categoryFolderId = await ensureFolder(drive, categoryName, rootFolderId);

  // 2. Pastikan subfolder quiz_set ada di dalam folder kategori
  const cleanSetName = (quizSet || 'Default').toString().trim() || 'Default';
  const targetFolderId = await ensureFolder(drive, cleanSetName, categoryFolderId);

  // 3. Siapkan stream untuk upload
  const mediaStream = new Readable();
  mediaStream.push(buffer);
  mediaStream.push(null);

  const cleanFileName = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  console.log(`[DriveService] Mengunggah ${cleanFileName} (${(buffer.length / 1024).toFixed(1)} KB) ke Google Drive (${categoryName}/${cleanSetName})...`);

  try {
    // 4. Buat file di Google Drive
    const fileRes = await drive.files.create({
      requestBody: {
        name: cleanFileName,
        parents: [targetFolderId]
      },
      media: {
        mimeType: mimetype,
        body: mediaStream
      },
      fields: 'id, name, webViewLink, webContentLink',
      supportsAllDrives: true
    });

    const fileId = fileRes.data.id;

    // 5. Ubah izin file menjadi publik (Anyone with the link - Viewer)
    try {
      await drive.permissions.create({
        fileId,
        requestBody: {
          role: 'reader',
          type: 'anyone'
        },
        supportsAllDrives: true
      });
    } catch (permErr) {
      console.warn(`[DriveService] Peringatan: Gagal set public permission untuk file ${fileId}:`, permErr.message);
    }

    // 6. Format URL publik yang optimal
    let publicUrl = '';
    if (isImage) {
      publicUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
    } else {
      publicUrl = `https://drive.google.com/file/d/${fileId}/preview`;
    }

    return {
      success: true,
      fileId,
      filename: cleanFileName,
      url: publicUrl,
      sizeBytes: buffer.length
    };
  } catch (driveUploadErr) {
    if (driveUploadErr.message && driveUploadErr.message.includes('storage quota')) {
      throw new Error(
        'Google Drive menolak upload via Service Account karena folder berada di akun personal (@gmail.com) yang tidak memiliki kuota storage Service Account (kebijakan Google: Service Accounts do not have storage quota). Solusi: Gunakan Shared Drive (Google Workspace / Drive Bersama) atau unggah file langsung ke Google Drive via browser lalu tempel link-nya di tab "Tempel Link".'
      );
    }
    throw driveUploadErr;
  }
}

/**
 * Ekstrak Google Drive File ID dari berbagai pola link
 */
function extractDriveFileId(url) {
  if (!url || typeof url !== 'string') return null;

  // Pola thumbnail: thumbnail?id=FILE_ID
  const thumbMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (thumbMatch) return thumbMatch[1];

  // Pola preview/file/d: /file/d/FILE_ID/
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];

  // Pola uc?id=FILE_ID
  const ucMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (ucMatch) return ucMatch[1];

  return null;
}

/**
 * Hapus file dari Google Drive secara aman (Cascade Delete 1 Soal)
 */
async function deleteDriveFile(fileUrlOrId) {
  if (!fileUrlOrId) return false;

  const fileId = extractDriveFileId(fileUrlOrId) || fileUrlOrId;
  // Cek apakah memang tampak seperti Google Drive File ID (panjang umumnya 25-45 char)
  if (!fileId || fileId.length < 15 || fileId.includes('/') || fileId.includes('youtube')) {
    return false;
  }

  const drive = getDriveClient();
  if (!drive) return false;

  try {
    console.log(`[DriveService] Menghapus file Drive: ${fileId}...`);
    await drive.files.delete({ fileId, supportsAllDrives: true });
    return true;
  } catch (err) {
    console.warn(`[DriveService] Lewati penghapusan file ${fileId} (mungkin sudah terhapus):`, err.message);
    return false;
  }
}

/**
 * Hapus subfolder quiz_set di folder Images dan Videos (Cascade Delete Seluruh Set)
 */
async function deleteQuizSetFolders(quizSetName) {
  const rootFolderId = process.env.DRIVE_ROOT_FOLDER_ID;
  if (!rootFolderId || !quizSetName) return false;

  const drive = getDriveClient();
  if (!drive) return false;

  const cleanSetName = quizSetName.toString().trim();
  const categories = ['Images', 'Videos'];

  for (const cat of categories) {
    try {
      // Cari folder kategori
      const catQuery = `name = '${cat}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '${rootFolderId}' in parents`;
      const catRes = await drive.files.list({
        q: catQuery,
        fields: 'files(id)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });
      
      if (catRes.data.files && catRes.data.files.length > 0) {
        const catId = catRes.data.files[0].id;
        // Cari subfolder set di dalam kategori
        const setQuery = `name = '${cleanSetName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '${catId}' in parents`;
        const setRes = await drive.files.list({
          q: setQuery,
          fields: 'files(id)',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true
        });

        if (setRes.data.files && setRes.data.files.length > 0) {
          for (const folder of setRes.data.files) {
            console.log(`[DriveService] Menghapus folder set "${cleanSetName}" di ${cat} (ID: ${folder.id})...`);
            await drive.files.delete({ fileId: folder.id, supportsAllDrives: true });
          }
        }
      }
    } catch (err) {
      console.warn(`[DriveService] Gagal menghapus subfolder set ${cleanSetName} di ${cat}:`, err.message);
    }
  }

  return true;
}

/**
 * Konversi link Google Drive mentah ke format siap render:
 * - Image: https://drive.google.com/thumbnail?id=FILE_ID&sz=w1000
 * - Video: https://drive.google.com/file/d/FILE_ID/preview
 */
function convertDriveUrl(url, type = 'image') {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  const fileId = extractDriveFileId(trimmed);
  if (fileId && (trimmed.includes('drive.google.com') || trimmed.includes('docs.google.com'))) {
    if (type === 'image') {
      return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
    } else {
      return `https://drive.google.com/file/d/${fileId}/preview`;
    }
  }

  return trimmed;
}

module.exports = {
  getDriveClient,
  ensureFolder,
  uploadMediaToDrive,
  extractDriveFileId,
  convertDriveUrl,
  deleteDriveFile,
  deleteQuizSetFolders
};
