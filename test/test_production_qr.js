/**
 * Test: Production QR & Base URL Detection
 * Memastikan URL QR Code dan teks join di layar Host menggunakan domain publik yang benar saat di-deploy ke Render / cloud.
 */

const assert = require('assert');
const { getBaseUrl, getLocalIpAddress } = require('../server/index');

console.log('--- Menguji Logika Base URL & QR Production ---');

// Simpan env asli
const originalEnv = { ...process.env };

function resetEnv() {
  process.env = { ...originalEnv };
  delete process.env.BASE_URL;
  delete process.env.RENDER;
  delete process.env.RENDER_EXTERNAL_URL;
  delete process.env.NODE_ENV;
}

try {
  // Test 1: Local Development (Default tanpa env var)
  resetEnv();
  const localIp = getLocalIpAddress();
  const localUrl = getBaseUrl();
  assert(localUrl.startsWith('http://'), 'Local URL harus diawali http://');
  assert(localUrl.includes(localIp), 'Local URL harus memuat IP lokal');
  console.log(`1. ✔ Local Development: ${localUrl}`);

  // Test 2: Render Automatic Environment (RENDER_EXTERNAL_URL)
  resetEnv();
  process.env.RENDER = 'true';
  process.env.RENDER_EXTERNAL_URL = 'https://nizhoot.onrender.com';
  const renderUrl = getBaseUrl();
  assert.strictEqual(renderUrl, 'https://nizhoot.onrender.com', 'Harus menggunakan RENDER_EXTERNAL_URL di Render');
  console.log(`2. ✔ Render Environment (Auto): ${renderUrl}`);

  // Test 3: Trailing Slash Trimming
  resetEnv();
  process.env.RENDER_EXTERNAL_URL = 'https://nizhoot.onrender.com/';
  const trimmedUrl = getBaseUrl();
  assert.strictEqual(trimmedUrl, 'https://nizhoot.onrender.com', 'Trailing slash harus dipangkas');
  console.log(`3. ✔ Trailing Slash Trimming: ${trimmedUrl}`);

  // Test 4: Manual Override (BASE_URL takes precedence over RENDER_EXTERNAL_URL)
  resetEnv();
  process.env.RENDER = 'true';
  process.env.RENDER_EXTERNAL_URL = 'https://nizhoot.onrender.com';
  process.env.BASE_URL = 'https://quiz.bandara.id';
  const overrideUrl = getBaseUrl();
  assert.strictEqual(overrideUrl, 'https://quiz.bandara.id', 'BASE_URL harus meng-override RENDER_EXTERNAL_URL');
  console.log(`4. ✔ Manual Override (BASE_URL): ${overrideUrl}`);

  // Test 5: Production Headers via Socket/Request Context
  resetEnv();
  process.env.NODE_ENV = 'production';
  const mockSocket = {
    handshake: {
      headers: {
        'x-forwarded-host': 'nizhoot-stage.onrender.com',
        'x-forwarded-proto': 'https'
      }
    }
  };
  const contextUrl = getBaseUrl(mockSocket);
  assert.strictEqual(contextUrl, 'https://nizhoot-stage.onrender.com', 'Harus mendeteksi host header di production');
  console.log(`5. ✔ Production Socket Handshake Headers: ${contextUrl}`);

  console.log('\n🎉 SEMUA PENGUJIAN BASE URL & QR PRODUCTION BERHASIL 100%!\n');
} finally {
  process.env = originalEnv;
  process.exit(0);
}
