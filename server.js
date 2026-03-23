const app = require('./app');
const cron = require('node-cron');
const http = require('http');
const { markMissedSlots } = require('./controllers/bookings.controller');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`\n🏋️  KIIT Fitness Center API running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

// ── Keep-alive ping (prevents Render free tier from sleeping) ──
// Pings self every 14 minutes — Render sleeps after 15min inactivity
if (process.env.NODE_ENV === 'production' && process.env.RENDER_EXTERNAL_URL) {
  const SELF_URL = process.env.RENDER_EXTERNAL_URL;
  cron.schedule('*/14 * * * *', () => {
    http.get(`${SELF_URL}/health`, (res) => {
      console.log(`[PING] Keep-alive → ${res.statusCode}`);
    }).on('error', (e) => {
      console.log(`[PING] Keep-alive error: ${e.message}`);
    });
  });
  console.log(`[PING] Keep-alive enabled → ${SELF_URL}`);
}

// ── Daily cron: Mark missed bookings at 8:15 PM IST (14:45 UTC) ──
cron.schedule('45 14 * * 2-7', async () => {
  console.log('[CRON] Running missed slot check...');
  try {
    await markMissedSlots();
  } catch (err) {
    console.error('[CRON] Error:', err.message);
  }
}, { timezone: 'UTC' });

// Also run at 9:10 PM IST (15:40 UTC) to catch stragglers
cron.schedule('40 15 * * 2-7', async () => {
  try { await markMissedSlots(); } catch (err) { console.error('[CRON] Error:', err.message); }
}, { timezone: 'UTC' });
