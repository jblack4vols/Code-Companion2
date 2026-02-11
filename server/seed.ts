import { db } from "./db";
import { users, locations, physicians, interactions, referrals, tasks } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

export async function seed() {
  const existingUsers = await db.select().from(users);
  if (existingUsers.length > 0) {
    console.log("Database already seeded, skipping...");
    return;
  }

  console.log("Seeding database...");

  const [owner] = await db.insert(users).values([
    { name: "Sarah Mitchell", email: "admin@tristar360.com", password: "admin123", role: "OWNER" },
    { name: "James Wilson", email: "james@tristar360.com", password: "pass123", role: "DIRECTOR" },
    { name: "Emily Chen", email: "emily@tristar360.com", password: "pass123", role: "MARKETER" },
    { name: "Maria Santos", email: "maria@tristar360.com", password: "pass123", role: "FRONT_DESK" },
    { name: "David Park", email: "david@tristar360.com", password: "pass123", role: "ANALYST" },
  ]).returning();

  const allUsers = await db.select().from(users);
  const marketerId = allUsers.find(u => u.email === "emily@tristar360.com")!.id;
  const directorId = allUsers.find(u => u.email === "james@tristar360.com")!.id;

  const locs = await db.insert(locations).values([
    { name: "Nashville Downtown", address: "100 Broadway", city: "Nashville", state: "TN", phone: "(615) 555-0100" },
    { name: "Franklin", address: "210 Main St", city: "Franklin", state: "TN", phone: "(615) 555-0200" },
    { name: "Murfreesboro", address: "500 Memorial Blvd", city: "Murfreesboro", state: "TN", phone: "(615) 555-0300" },
    { name: "Hendersonville", address: "300 Indian Lake Blvd", city: "Hendersonville", state: "TN", phone: "(615) 555-0400" },
    { name: "Brentwood", address: "150 Franklin Rd", city: "Brentwood", state: "TN", phone: "(615) 555-0500" },
    { name: "Mt. Juliet", address: "400 N Mt Juliet Rd", city: "Mt. Juliet", state: "TN", phone: "(615) 555-0600" },
    { name: "Clarksville", address: "700 Riverside Dr", city: "Clarksville", state: "TN", phone: "(931) 555-0700" },
    { name: "Gallatin", address: "200 W Main St", city: "Gallatin", state: "TN", phone: "(615) 555-0800" },
  ]).returning();

  const physData = [
    { firstName: "Robert", lastName: "Anderson", specialty: "Orthopedics", practiceName: "Nashville Ortho Group", city: "Nashville", state: "TN", phone: "(615) 555-1001", email: "randerson@nashortho.com", status: "ACTIVE" as const, relationshipStage: "STRONG" as const, priority: "HIGH" as const, assignedOwnerId: marketerId, npi: "1234567890" },
    { firstName: "Lisa", lastName: "Thompson", specialty: "Primary Care", practiceName: "Thompson Family Medicine", city: "Franklin", state: "TN", phone: "(615) 555-1002", email: "lthompson@tfm.com", status: "ACTIVE" as const, relationshipStage: "DEVELOPING" as const, priority: "HIGH" as const, assignedOwnerId: marketerId },
    { firstName: "Michael", lastName: "Reeves", specialty: "Sports Medicine", practiceName: "TN Sports Medicine", city: "Nashville", state: "TN", phone: "(615) 555-1003", email: "mreeves@tnsports.com", status: "ACTIVE" as const, relationshipStage: "STRONG" as const, priority: "MEDIUM" as const, assignedOwnerId: directorId },
    { firstName: "Jennifer", lastName: "Patel", specialty: "Neurology", practiceName: "Patel Neurology Associates", city: "Murfreesboro", state: "TN", phone: "(615) 555-1004", email: "jpatel@patelneurology.com", status: "ACTIVE" as const, relationshipStage: "NEW" as const, priority: "MEDIUM" as const, assignedOwnerId: marketerId },
    { firstName: "William", lastName: "Garcia", specialty: "Pain Management", practiceName: "Mid-TN Pain Center", city: "Hendersonville", state: "TN", phone: "(615) 555-1005", status: "ACTIVE" as const, relationshipStage: "AT_RISK" as const, priority: "HIGH" as const, assignedOwnerId: marketerId },
    { firstName: "Karen", lastName: "Brooks", specialty: "Rheumatology", practiceName: "Brooks Rheumatology", city: "Brentwood", state: "TN", phone: "(615) 555-1006", email: "kbrooks@brooksrheum.com", status: "PROSPECT" as const, relationshipStage: "NEW" as const, priority: "LOW" as const },
    { firstName: "David", lastName: "Kim", specialty: "Orthopedics", practiceName: "Kim Orthopedic Surgery", city: "Nashville", state: "TN", phone: "(615) 555-1007", email: "dkim@kimortho.com", status: "ACTIVE" as const, relationshipStage: "DEVELOPING" as const, priority: "MEDIUM" as const, assignedOwnerId: directorId },
    { firstName: "Amy", lastName: "Johnson", specialty: "Primary Care", practiceName: "Johnson Medical Group", city: "Clarksville", state: "TN", phone: "(931) 555-1008", email: "ajohnson@jmg.com", status: "ACTIVE" as const, relationshipStage: "STRONG" as const, priority: "HIGH" as const, assignedOwnerId: marketerId },
    { firstName: "Thomas", lastName: "Wright", specialty: "Spine Surgery", practiceName: "Nashville Spine Institute", city: "Nashville", state: "TN", phone: "(615) 555-1009", status: "INACTIVE" as const, relationshipStage: "AT_RISK" as const, priority: "LOW" as const },
    { firstName: "Rachel", lastName: "Cooper", specialty: "Internal Medicine", practiceName: "Cooper Internal Med", city: "Gallatin", state: "TN", phone: "(615) 555-1010", email: "rcooper@coopermed.com", status: "PROSPECT" as const, relationshipStage: "NEW" as const, priority: "MEDIUM" as const },
  ];

  const physRecords = await db.insert(physicians).values(physData).returning();

  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

  const interactionData = [
    { physicianId: physRecords[0].id, userId: marketerId, type: "VISIT" as const, occurredAt: daysAgo(3), summary: "Dropped off marketing materials and discussed new back pain rehabilitation program.", nextStep: "Follow up on referral form submissions", locationId: locs[0].id },
    { physicianId: physRecords[0].id, userId: marketerId, type: "LUNCH" as const, occurredAt: daysAgo(30), summary: "Lunch meeting to review Q4 referral patterns and patient outcomes.", locationId: locs[0].id },
    { physicianId: physRecords[1].id, userId: marketerId, type: "CALL" as const, occurredAt: daysAgo(7), summary: "Phone call to introduce Tristar PT services for primary care referrals.", nextStep: "Schedule in-person visit next week" },
    { physicianId: physRecords[2].id, userId: directorId, type: "VISIT" as const, occurredAt: daysAgo(14), summary: "Met with office manager to streamline referral process. Agreed on electronic fax system.", locationId: locs[0].id },
    { physicianId: physRecords[3].id, userId: marketerId, type: "EMAIL" as const, occurredAt: daysAgo(5), summary: "Sent introductory email with Tristar PT clinic brochure and neurological rehab capabilities." },
    { physicianId: physRecords[4].id, userId: marketerId, type: "VISIT" as const, occurredAt: daysAgo(60), summary: "Visit to pain management clinic. Dr. Garcia was unavailable but spoke with PA.", nextStep: "Reschedule meeting with Dr. Garcia directly" },
    { physicianId: physRecords[7].id, userId: marketerId, type: "EVENT" as const, occurredAt: daysAgo(10), summary: "Met at Clarksville Medical Society networking event. Very receptive to partnership.", locationId: locs[6].id },
    { physicianId: physRecords[6].id, userId: directorId, type: "CALL" as const, occurredAt: daysAgo(20), summary: "Discussed surgical rehab protocols and patient handoff procedures." },
  ];

  await db.insert(interactions).values(interactionData);

  const referralData = [
    { physicianId: physRecords[0].id, locationId: locs[0].id, referralDate: daysAgo(2).toISOString().split("T")[0], patientInitialsOrAnonId: "JD-001", status: "RECEIVED" as const, payerType: "COMMERCIAL" as const, diagnosisCategory: "Lumbar Disc Herniation" },
    { physicianId: physRecords[0].id, locationId: locs[0].id, referralDate: daysAgo(10).toISOString().split("T")[0], patientInitialsOrAnonId: "MK-002", status: "EVAL_COMPLETED" as const, payerType: "MEDICARE" as const, diagnosisCategory: "Total Knee Replacement" },
    { physicianId: physRecords[0].id, locationId: locs[1].id, referralDate: daysAgo(25).toISOString().split("T")[0], patientInitialsOrAnonId: "AS-003", status: "DISCHARGED" as const, payerType: "COMMERCIAL" as const, diagnosisCategory: "Rotator Cuff Repair" },
    { physicianId: physRecords[2].id, locationId: locs[0].id, referralDate: daysAgo(5).toISOString().split("T")[0], patientInitialsOrAnonId: "BT-004", status: "SCHEDULED" as const, payerType: "COMMERCIAL" as const, diagnosisCategory: "ACL Reconstruction" },
    { physicianId: physRecords[2].id, locationId: locs[0].id, referralDate: daysAgo(15).toISOString().split("T")[0], patientInitialsOrAnonId: "CP-005", status: "EVAL_COMPLETED" as const, payerType: "CASH" as const, diagnosisCategory: "Ankle Sprain" },
    { physicianId: physRecords[1].id, locationId: locs[1].id, referralDate: daysAgo(8).toISOString().split("T")[0], patientInitialsOrAnonId: "RL-006", status: "RECEIVED" as const, payerType: "MEDICAID" as const, diagnosisCategory: "Chronic Low Back Pain" },
    { physicianId: physRecords[7].id, locationId: locs[6].id, referralDate: daysAgo(12).toISOString().split("T")[0], patientInitialsOrAnonId: "HW-007", status: "EVAL_COMPLETED" as const, payerType: "MEDICARE" as const, diagnosisCategory: "Hip Replacement" },
    { physicianId: physRecords[7].id, locationId: locs[6].id, referralDate: daysAgo(20).toISOString().split("T")[0], patientInitialsOrAnonId: "NB-008", status: "DISCHARGED" as const, payerType: "COMMERCIAL" as const, diagnosisCategory: "Frozen Shoulder" },
    { physicianId: physRecords[6].id, locationId: locs[0].id, referralDate: daysAgo(18).toISOString().split("T")[0], patientInitialsOrAnonId: "KM-009", status: "SCHEDULED" as const, payerType: "COMMERCIAL" as const, diagnosisCategory: "Post-Op Knee" },
    { physicianId: physRecords[3].id, locationId: locs[2].id, referralDate: daysAgo(4).toISOString().split("T")[0], patientInitialsOrAnonId: "TP-010", status: "RECEIVED" as const, payerType: "MEDICARE" as const, diagnosisCategory: "Cervical Radiculopathy" },
  ];

  await db.insert(referrals).values(referralData);

  const taskData = [
    { physicianId: physRecords[4].id, assignedToUserId: marketerId, dueAt: daysAgo(-2), priority: "HIGH" as const, description: "Schedule follow-up meeting with Dr. Garcia - last visit was 60+ days ago" },
    { physicianId: physRecords[1].id, assignedToUserId: marketerId, dueAt: daysAgo(-5), priority: "MEDIUM" as const, description: "Visit Dr. Thompson's office in Franklin to discuss referral partnerships" },
    { physicianId: physRecords[3].id, assignedToUserId: marketerId, dueAt: daysAgo(-7), priority: "LOW" as const, description: "Send follow-up email to Dr. Patel about neurological rehab programs" },
    { physicianId: physRecords[5].id, assignedToUserId: directorId, dueAt: daysAgo(-10), priority: "MEDIUM" as const, description: "Research Dr. Brooks' practice and prepare outreach strategy" },
    { physicianId: physRecords[0].id, assignedToUserId: marketerId, dueAt: daysAgo(5), priority: "HIGH" as const, status: "DONE" as const, description: "Deliver updated outcome reports to Dr. Anderson" },
  ];

  await db.insert(tasks).values(taskData);

  console.log("Seed complete: 5 users, 8 locations, 10 physicians, interactions, referrals, tasks");
}
