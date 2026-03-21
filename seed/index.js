/**
 * SEED SCRIPT — Run once to populate Firestore with:
 *  - 6 KIIT campus gyms
 *  - 50 mock students (students_master for verification)
 *  - 1 superadmin user  (must match a real Firebase Auth user you create)
 *
 * Usage:  npm run seed
 */

require('dotenv').config();
const { db, auth } = require('../firebase/admin');

// ─── KIIT GYM DATA ───────────────────────────────────────────────
const GYMS = [
  {
    id: 'campus1-gym',
    name: 'Campus 1 Fitness Center',
    campus: 'Campus 1',
    location: 'Near Campus 1 Hostel, KIIT University, Bhubaneswar',
    gender: 'male',
    capacityPerSlot: 20,
    description: 'A well-equipped fitness center serving the residents of Campus 1. Features modern cardio and strength training equipment.',
    equipment: [
      { name: 'Treadmill', count: 4, category: 'cardio' },
      { name: 'Stationary Bike', count: 3, category: 'cardio' },
      { name: 'Elliptical Trainer', count: 2, category: 'cardio' },
      { name: 'Flat Bench Press', count: 3, category: 'strength' },
      { name: 'Incline Bench Press', count: 2, category: 'strength' },
      { name: 'Squat Rack', count: 2, category: 'strength' },
      { name: 'Deadlift Platform', count: 1, category: 'strength' },
      { name: 'Lat Pulldown Machine', count: 2, category: 'machine' },
      { name: 'Cable Crossover', count: 1, category: 'machine' },
      { name: 'Leg Press Machine', count: 1, category: 'machine' },
      { name: 'Dumbbells (5–50 kg)', count: 1, category: 'free weights' },
      { name: 'Barbells + Weight Plates', count: 4, category: 'free weights' },
    ],
    trainers: [
      { name: 'Rajesh Kumar', role: 'Head Trainer', specialization: 'Strength & Conditioning', phone: '9XXXXXXXXX' },
      { name: 'Anil Panda', role: 'Assistant Trainer', specialization: 'Cardio & Weight Loss', phone: '9XXXXXXXXX' },
    ],
    images: [],
    admins: [],
    announcements: [],
  },
  {
    id: 'campus2-gym',
    name: 'Campus 2 Fitness Center',
    campus: 'Campus 2',
    location: 'Campus 2 Recreation Block, KIIT University, Bhubaneswar',
    gender: 'male',
    capacityPerSlot: 25,
    description: 'One of the largest gyms on campus with a wide range of equipment and certified trainers.',
    equipment: [
      { name: 'Treadmill', count: 6, category: 'cardio' },
      { name: 'Rowing Machine', count: 2, category: 'cardio' },
      { name: 'Stationary Bike', count: 4, category: 'cardio' },
      { name: 'Flat Bench Press', count: 4, category: 'strength' },
      { name: 'Squat Rack', count: 3, category: 'strength' },
      { name: 'Power Rack', count: 1, category: 'strength' },
      { name: 'Smith Machine', count: 1, category: 'machine' },
      { name: 'Chest Fly Machine', count: 2, category: 'machine' },
      { name: 'Leg Curl / Extension', count: 2, category: 'machine' },
      { name: 'Cable Machine', count: 2, category: 'machine' },
      { name: 'Dumbbells (5–60 kg)', count: 1, category: 'free weights' },
      { name: 'Pull-up / Dip Station', count: 2, category: 'bodyweight' },
    ],
    trainers: [
      { name: 'Suresh Mishra', role: 'Head Trainer', specialization: 'Bodybuilding & Hypertrophy', phone: '9XXXXXXXXX' },
      { name: 'Prashant Das', role: 'Trainer', specialization: 'Functional Fitness', phone: '9XXXXXXXXX' },
    ],
    images: [],
    admins: [],
    announcements: [],
  },
  {
    id: 'campus3-gym',
    name: 'Campus 3 Fitness Center',
    campus: 'Campus 3',
    location: 'Campus 3 Sports Complex, KIIT University, Bhubaneswar',
    gender: 'male',
    capacityPerSlot: 20,
    description: 'Compact but well-maintained gym with all essential equipment for a complete workout.',
    equipment: [
      { name: 'Treadmill', count: 3, category: 'cardio' },
      { name: 'Stationary Bike', count: 2, category: 'cardio' },
      { name: 'Flat Bench Press', count: 3, category: 'strength' },
      { name: 'Squat Rack', count: 2, category: 'strength' },
      { name: 'Lat Pulldown', count: 2, category: 'machine' },
      { name: 'Pec Deck Machine', count: 1, category: 'machine' },
      { name: 'Leg Press', count: 1, category: 'machine' },
      { name: 'Dumbbells (5–40 kg)', count: 1, category: 'free weights' },
      { name: 'Pull-up Bar', count: 2, category: 'bodyweight' },
    ],
    trainers: [
      { name: 'Manoj Behera', role: 'Head Trainer', specialization: 'General Fitness', phone: '9XXXXXXXXX' },
    ],
    images: [],
    admins: [],
    announcements: [],
  },
  {
    id: 'campus4-gym',
    name: 'Campus 4 Fitness Center',
    campus: 'Campus 4',
    location: 'Campus 4 Hostel Block, KIIT University, Bhubaneswar',
    gender: 'female',
    capacityPerSlot: 20,
    description: 'Exclusively for female students. Fully air-conditioned with yoga and Zumba space alongside regular gym equipment.',
    equipment: [
      { name: 'Treadmill', count: 4, category: 'cardio' },
      { name: 'Elliptical Trainer', count: 3, category: 'cardio' },
      { name: 'Stationary Bike', count: 3, category: 'cardio' },
      { name: 'Yoga Mats & Stretching Area', count: 10, category: 'flexibility' },
      { name: 'Resistance Band Set', count: 15, category: 'flexibility' },
      { name: 'Flat Bench Press', count: 2, category: 'strength' },
      { name: 'Dumbbells (2–25 kg)', count: 1, category: 'free weights' },
      { name: 'Lat Pulldown', count: 2, category: 'machine' },
      { name: 'Hip Abductor Machine', count: 2, category: 'machine' },
      { name: 'Leg Press Machine', count: 1, category: 'machine' },
    ],
    trainers: [
      { name: 'Priya Singh', role: 'Head Trainer', specialization: 'Yoga & Toning', phone: '9XXXXXXXXX' },
      { name: 'Sneha Rath', role: 'Trainer', specialization: 'Cardio & Dance Fitness', phone: '9XXXXXXXXX' },
    ],
    images: [],
    admins: [],
    announcements: [],
  },
  {
    id: 'campus5-gym',
    name: 'Campus 5 Fitness Center',
    campus: 'Campus 5',
    location: 'Campus 5 Recreational Area, KIIT University, Bhubaneswar',
    gender: 'male',
    capacityPerSlot: 18,
    description: 'Fully renovated in 2023 with new equipment. Popular for its dedicated free weight zone.',
    equipment: [
      { name: 'Treadmill', count: 4, category: 'cardio' },
      { name: 'Stationary Bike', count: 2, category: 'cardio' },
      { name: 'Flat / Incline / Decline Bench', count: 3, category: 'strength' },
      { name: 'Squat Rack', count: 2, category: 'strength' },
      { name: 'Olympic Barbell + Plates', count: 4, category: 'free weights' },
      { name: 'Dumbbells (5–50 kg)', count: 1, category: 'free weights' },
      { name: 'Lat Pulldown / Row Machine', count: 2, category: 'machine' },
      { name: 'Smith Machine', count: 1, category: 'machine' },
      { name: 'Cable Crossover', count: 1, category: 'machine' },
      { name: 'Pull-up / Dip Station', count: 2, category: 'bodyweight' },
    ],
    trainers: [
      { name: 'Bikash Nayak', role: 'Head Trainer', specialization: 'Powerlifting', phone: '9XXXXXXXXX' },
    ],
    images: [],
    admins: [],
    announcements: [],
  },
  {
    id: 'campus11-gym',
    name: 'Campus 11 Fitness Center',
    campus: 'Campus 11',
    location: 'Campus 11 Complex, KIIT University, Bhubaneswar',
    gender: 'both',
    capacityPerSlot: 30,
    description: 'The largest and most modern gym at KIIT. Open to both male and female students with separate sections. Includes a dedicated cardio floor, strength zone, and functional training area.',
    equipment: [
      { name: 'Treadmill', count: 8, category: 'cardio' },
      { name: 'Rowing Machine', count: 3, category: 'cardio' },
      { name: 'Stationary Bike', count: 5, category: 'cardio' },
      { name: 'Elliptical Trainer', count: 4, category: 'cardio' },
      { name: 'Flat Bench Press', count: 5, category: 'strength' },
      { name: 'Incline / Decline Bench', count: 4, category: 'strength' },
      { name: 'Squat Rack', count: 4, category: 'strength' },
      { name: 'Power Rack', count: 2, category: 'strength' },
      { name: 'Smith Machine', count: 2, category: 'machine' },
      { name: 'Leg Press', count: 2, category: 'machine' },
      { name: 'Leg Curl / Extension', count: 2, category: 'machine' },
      { name: 'Cable Crossover', count: 2, category: 'machine' },
      { name: 'Chest Fly Machine', count: 2, category: 'machine' },
      { name: 'Shoulder Press Machine', count: 2, category: 'machine' },
      { name: 'Dumbbells (2–60 kg)', count: 1, category: 'free weights' },
      { name: 'Olympic Barbells + Plates', count: 6, category: 'free weights' },
      { name: 'Pull-up / Dip Station', count: 4, category: 'bodyweight' },
      { name: 'Yoga / Stretching Zone', count: 1, category: 'flexibility' },
      { name: 'Functional Training Rig', count: 1, category: 'functional' },
      { name: 'Battle Ropes', count: 2, category: 'functional' },
      { name: 'Kettlebells (8–32 kg)', count: 1, category: 'free weights' },
    ],
    trainers: [
      { name: 'Santosh Mohapatra', role: 'Head Trainer', specialization: 'Sports Performance', phone: '9XXXXXXXXX' },
      { name: 'Deepika Sahu', role: 'Trainer (Female Section)', specialization: 'Yoga & Core Training', phone: '9XXXXXXXXX' },
      { name: 'Ravi Sharma', role: 'Trainer', specialization: 'Hypertrophy & Nutrition', phone: '9XXXXXXXXX' },
    ],
    images: [],
    admins: [],
    announcements: [],
  },
];

// ─── MOCK STUDENTS (for verification) ───────────────────────────
const HOSTELS_MALE = ['NH-1', 'NH-2', 'NH-3', 'NH-4', 'NH-5', 'NH-7', 'NH-9', 'NH-11', 'NH-13'];
const HOSTELS_FEMALE = ['NH-6', 'NH-8', 'NH-10', 'NH-12', 'NH-14', 'NH-16'];
const MALE_NAMES = ['Aryan', 'Rohit', 'Karan', 'Vishal', 'Siddharth', 'Aman', 'Nikhil', 'Rahul', 'Akash', 'Deepak'];
const FEMALE_NAMES = ['Priya', 'Anjali', 'Sneha', 'Ritika', 'Divya', 'Komal', 'Riya', 'Pooja', 'Isha', 'Ananya'];
const SURNAMES = ['Kumar', 'Sharma', 'Singh', 'Patel', 'Mishra', 'Das', 'Roy', 'Gupta', 'Mehta', 'Nair'];

function randomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateMockStudents(count = 50) {
  const students = [];
  for (let i = 1; i <= count; i++) {
    const gender = i % 3 === 0 ? 'female' : 'male';
    const firstName = gender === 'female' ? randomItem(FEMALE_NAMES) : randomItem(MALE_NAMES);
    const surname = randomItem(SURNAMES);
    const rollNo = `2${String(23000 + i).padStart(7, '0')}`;
    const email = `${firstName.toLowerCase()}.${surname.toLowerCase()}${i}@stu.kiit.ac.in`;
    const hostel = gender === 'female' ? randomItem(HOSTELS_FEMALE) : randomItem(HOSTELS_MALE);
    const room = `${Math.floor(100 + Math.random() * 400)}`;
    students.push({ rollNo, name: `${firstName} ${surname}`, email, hostel, room, gender });
  }
  return students;
}

// ─── SEED FUNCTION ───────────────────────────────────────────────
async function seed() {
  console.log('🌱 Starting KIIT Gym seed...\n');

  // Seed gyms
  console.log('📍 Seeding gyms...');
  for (const gym of GYMS) {
    const { id, ...data } = gym;
    await db.collection('gyms').doc(id).set(data);
    console.log(`   ✓ ${gym.name}`);
  }

  // Seed mock students_master
  console.log('\n👨‍🎓 Seeding 50 mock students...');
  const students = generateMockStudents(50);
  const batch = db.batch();
  students.forEach((s) => {
    batch.set(db.collection('students_master').doc(s.rollNo), s);
  });
  await batch.commit();
  console.log('   ✓ 50 students seeded\n');

  // Print a few sample roll numbers for testing
  console.log('📋 Sample students for testing:');
  students.slice(0, 5).forEach((s) => {
    console.log(`   Roll: ${s.rollNo} | Name: ${s.name} | Email: ${s.email} | Hostel: ${s.hostel} | Gender: ${s.gender}`);
  });

  console.log('\n✅ Seed complete!\n');
  console.log('Next step: Create a superadmin in Firebase Auth and update their Firestore role.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
