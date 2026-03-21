// Valid 1-hour slots for KIIT gym
// Morning: 6am–9am  |  Evening: 4pm–8pm
// Monday is off

const SLOTS = [
  { id: '06-07', label: '6:00 AM – 7:00 AM', period: 'morning', startHour: 6 },
  { id: '07-08', label: '7:00 AM – 8:00 AM', period: 'morning', startHour: 7 },
  { id: '08-09', label: '8:00 AM – 9:00 AM', period: 'morning', startHour: 8 },
  { id: '16-17', label: '4:00 PM – 5:00 PM', period: 'evening', startHour: 16 },
  { id: '17-18', label: '5:00 PM – 6:00 PM', period: 'evening', startHour: 17 },
  { id: '18-19', label: '6:00 PM – 7:00 PM', period: 'evening', startHour: 18 },
  { id: '19-20', label: '7:00 PM – 8:00 PM', period: 'evening', startHour: 19 },
];

const DAYS_OFF = [1]; // 0=Sun, 1=Mon, 2=Tue…

const isGymOpen = (date = new Date()) => !DAYS_OFF.includes(date.getDay());

const getSlotById = (id) => SLOTS.find((s) => s.id === id);

// Returns YYYY-MM-DD for IST (UTC+5:30)
const todayIST = () => {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().split('T')[0];
};

// Slot booking closes 5 min before slot starts
const isSlotBookable = (slotId, dateStr) => {
  const slot = getSlotById(slotId);
  if (!slot) return false;
  const [year, month, day] = dateStr.split('-').map(Number);
  const slotStart = new Date(Date.UTC(year, month - 1, day, slot.startHour - 5, 60 - 30)); // IST offset
  const fiveMinBefore = new Date(slotStart.getTime() - 5 * 60 * 1000);
  return new Date() < fiveMinBefore;
};

module.exports = { SLOTS, DAYS_OFF, isGymOpen, getSlotById, todayIST, isSlotBookable };
