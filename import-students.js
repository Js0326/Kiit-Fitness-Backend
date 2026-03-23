'use strict';
/**
 * import-students.js
 * ──────────────────
 * Bulk-imports real student data into Firestore students_master collection.
 *
 * USAGE:
 *   1. Edit the STUDENTS array below with real student data
 *      OR set INPUT_CSV to a CSV file path (see CSV format below)
 *   2. Make sure backend/.env exists with Firebase credentials
 *   3. Run from the backend folder:
 *        node import-students.js
 *
 * CSV FORMAT (if using a file):
 *   rollNo,name,email,hostel,room,gender
 *   22051234,Rahul Kumar,rahul.kumar1@stu.kiit.ac.in,NH-7,205,male
 *   22051235,Priya Singh,priya.singh2@stu.kiit.ac.in,NH-8,310,female
 */

require('dotenv').config();
const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

// ── Firebase init ──────────────────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      project_id:   process.env.FIREBASE_PROJECT_ID,
      private_key:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
}
const db = admin.firestore();

// ══════════════════════════════════════════════════════════════
//  OPTION 1: Edit this array directly
//  Required fields: rollNo, name, email, hostel, room, gender
//  gender must be exactly "male" or "female" (lowercase)
//  hostel must match exactly what students will type (e.g. "NH-7")
// ══════════════════════════════════════════════════════════════
const STUDENTS = [
  // Example — replace with real data:
  // { rollNo: '22051001', name: 'Rahul Kumar',   email: 'rahul.kumar1@stu.kiit.ac.in',   hostel: 'NH-7',  room: '205', gender: 'male'   },
  // { rollNo: '22051002', name: 'Priya Singh',   email: 'priya.singh2@stu.kiit.ac.in',   hostel: 'NH-8',  room: '310', gender: 'female' },
  // { rollNo: '22051003', name: 'Aryan Sharma',  email: 'aryan.sharma3@stu.kiit.ac.in',  hostel: 'NH-3',  room: '112', gender: 'male'   },
];

// ══════════════════════════════════════════════════════════════
//  OPTION 2: Set path to a CSV file
//  Leave as null to use the STUDENTS array above
// ══════════════════════════════════════════════════════════════
const INPUT_CSV = null; // e.g. './students.csv'

// ── CSV Parser ─────────────────────────────────────────────────
function parseCSV(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  }).filter(s => s.rollNo);
}

// ── Validation ─────────────────────────────────────────────────
function validate(student, lineNum) {
  const errors = [];
  if (!student.rollNo) errors.push('missing rollNo');
  if (!student.name)   errors.push('missing name');
  if (!student.email)  errors.push('missing email');
  if (!student.hostel) errors.push('missing hostel');
  if (!student.room)   errors.push('missing room');
  if (!['male','female'].includes(student.gender?.toLowerCase())) errors.push('gender must be "male" or "female"');
  if (student.email && !student.email.includes('kiit.ac.in')) errors.push('email must be a KIIT address');
  if (errors.length) {
    console.warn(`  ⚠  Row ${lineNum} (${student.rollNo || '?'}): ${errors.join(', ')}`);
    return false;
  }
  return true;
}

// ── Main ────────────────────────────────────────────────────────
async function run() {
  console.log('\n📋  KIIT Student Import Tool\n' + '─'.repeat(50));

  let students = INPUT_CSV ? parseCSV(INPUT_CSV) : STUDENTS;

  if (students.length === 0) {
    console.log('  ❌  No students to import.');
    console.log('  Edit the STUDENTS array in this file or set INPUT_CSV to a .csv path.');
    process.exit(1);
  }

  console.log(`  Found ${students.length} students to import\n`);

  // Validate all rows first
  let valid = students.filter((s, i) => validate(s, i + 2));
  console.log(`  ${valid.length} valid, ${students.length - valid.length} skipped\n`);

  if (valid.length === 0) {
    console.log('  ❌  No valid students. Fix errors above and retry.');
    process.exit(1);
  }

  // Batch write (max 500 per batch)
  let written = 0, skipped = 0;
  const chunks = [];
  for (let i = 0; i < valid.length; i += 400) chunks.push(valid.slice(i, i + 400));

  for (const chunk of chunks) {
    const batch = db.batch();
    for (const s of chunk) {
      const docRef = db.collection('students_master').doc(s.rollNo);
      batch.set(docRef, {
        rollNo:  s.rollNo.trim(),
        name:    s.name.trim(),
        email:   s.email.trim().toLowerCase(),
        hostel:  s.hostel.trim(),
        room:    s.room.trim(),
        gender:  s.gender.trim().toLowerCase(),
      }, { merge: true }); // merge: true = update existing, don't overwrite
      written++;
    }
    await batch.commit();
    console.log(`  ✓  Wrote ${written} students so far…`);
  }

  console.log(`\n  ✅  Import complete!`);
  console.log(`     Written: ${written}`);
  console.log(`     Skipped: ${students.length - written}\n`);

  // Print a few for confirmation
  console.log('  Sample imported records:');
  valid.slice(0, 3).forEach(s => {
    console.log(`     ${s.rollNo} | ${s.name} | ${s.hostel} | ${s.gender}`);
  });

  console.log('\n  Students can now register using these roll numbers.\n');
  process.exit(0);
}

run().catch(err => {
  console.error('  ❌  Import failed:', err.message);
  process.exit(1);
});
