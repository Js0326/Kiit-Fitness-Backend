const app = require('./app');
const cron = require('node-cron');
const { markMissedSlots } = require('./controllers/bookings.controller');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`\n🏋️  KIIT Fitness Center API running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

// Daily cron: Mark missed bookings at 8:15 PM IST (14:45 UTC)
cron.schedule('45 14 * * 2-7', async () => {
  console.log('[CRON] Running missed slot check...');
  try {
    await markMissedSlots();
  } catch (err) {
    console.error('[CRON] Error:', err.message);
  }
}, { timezone: 'UTC' });

// Also run at 3:10 AM IST (21:40 UTC previous day → catches late stragglers)
cron.schedule('40 21 * * 2-7', async () => {
  try { await markMissedSlots(); } catch (err) { console.error('[CRON] Error:', err.message); }
}, { timezone: 'UTC' });
