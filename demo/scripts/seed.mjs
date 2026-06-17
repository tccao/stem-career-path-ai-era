// Seed demo data: one admin account (users/admins table + demo credential), two provisioned
// students (one per learning path), sample applications across lifecycle states, and the real
// curriculum. Idempotent: safe to re-run (skips sample apps if already seeded).
//
//   npm run db:create   # ensure tables
//   npm run db:seed

import { createTables } from './create-tables.mjs';
import { hashPassword } from '../src/services/auth.mjs';
import * as demoAuth from '../src/repositories/demoAuth.mjs';
import * as membersRepo from '../src/repositories/members.mjs';
import * as appsRepo from '../src/repositories/applications.mjs';
import * as lc from '../src/services/lifecycle.mjs';
import { seedCurriculum } from './seed-curriculum.mjs';

const ADMIN = { email: 'admin@codeforgood.us', password: 'admin1234', memberId: 'admin-001' };
const STUDENT_B = { email: 'student@codeforgood.us', password: 'student1234' }; // fast track
const STUDENT_A = { email: 'roadmap@codeforgood.us', password: 'student1234' }; // full roadmap

const ignoreExists = (e) => {
  if (e?.name === 'ConditionalCheckFailedException') return null;
  throw e;
};

async function seedAdmin() {
  await membersRepo
    .createMember({
      memberId: ADMIN.memberId,
      email: ADMIN.email,
      fullName: 'CFG Admin',
      role: 'admin',
      status: 'ACTIVE',
      accessEndsAt: '2099-01-01T00:00:00.000Z',
    })
    .catch(ignoreExists);
  await demoAuth.putCredential({
    email: ADMIN.email,
    memberId: ADMIN.memberId,
    role: 'admin',
    passwordHash: hashPassword(ADMIN.password),
  });
}

const applicant = (email, fullName, over = {}) => ({
  email,
  fullName,
  stage: 'recent_graduate',
  preferredTrack: 'full_roadmap',
  background: 'STEM graduate seeking AI-era readiness.',
  links: 'https://github.com/example',
  ageBracket: '18+',
  ...over,
});

// Provision an ACTIVE student and attach a demo login credential.
async function provisionStudent(email, fullName, track, password) {
  const app = await lc.submitApplication(applicant(email, fullName, { preferredTrack: track }));
  await lc.scheduleInterview(app.applicationId, { actorId: ADMIN.memberId, interviewAt: 't' });
  await lc.approveBeneficiary(app.applicationId, { actorId: ADMIN.memberId });
  const { memberId } = await lc.provision(app.applicationId, { actorId: ADMIN.memberId });
  await demoAuth.putCredential({
    email,
    memberId,
    role: 'student',
    passwordHash: hashPassword(password),
  });
}

async function seedSampleApplications() {
  const already = await appsRepo.findByEmail('maya@student.edu');
  if (already.length) {
    console.log('  sample applications already present - skipping');
    return;
  }

  // Queue states for the admin dashboard
  await lc.submitApplication(applicant('maya@student.edu', 'Maya Chen', { stage: 'current_student' }));
  await lc.submitApplication(applicant('jordan@student.edu', 'Jordan Blake'));

  const diego = await lc.submitApplication(applicant('diego@student.edu', 'Diego Ramirez'));
  await lc.scheduleInterview(diego.applicationId, {
    actorId: ADMIN.memberId,
    interviewAt: '2026-06-22T17:00:00.000Z',
  });

  const priya = await lc.submitApplication(
    applicant('priya@student.edu', 'Priya Patel', { preferredTrack: 'fast_track' }),
  );
  await lc.scheduleInterview(priya.applicationId, { actorId: ADMIN.memberId, interviewAt: 't' });
  await lc.approveBeneficiary(priya.applicationId, { actorId: ADMIN.memberId });

  const sam = await lc.submitApplication(applicant('sam@student.edu', "Sam O'Connor"));
  await lc.requireDonation(sam.applicationId, { actorId: ADMIN.memberId });

  // Two provisioned students, one per learning path (for the student dashboard)
  await provisionStudent(STUDENT_B.email, 'Lee Nakamura', 'fast_track', STUDENT_B.password);
  await provisionStudent(STUDENT_A.email, 'Ava Okafor', 'full_roadmap', STUDENT_A.password);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await createTables({ reset: false });
  await seedAdmin();
  await seedSampleApplications();
  const c = await seedCurriculum();
  console.log(`  curriculum: ${c.pillars} pillars + ${c.weeks} fast-track weeks seeded`);
  console.log('\nSeed complete.');
  console.log('  Admin login:             ' + ADMIN.email + ' / ' + ADMIN.password);
  console.log('  Student (fast track):    ' + STUDENT_B.email + ' / ' + STUDENT_B.password);
  console.log('  Student (full roadmap):  ' + STUDENT_A.email + ' / ' + STUDENT_A.password);
}

export { seedAdmin, seedSampleApplications, ADMIN, STUDENT_A, STUDENT_B };
