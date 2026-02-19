import { db } from "../server/db";
import { users, locations, physicians, referrals, interactions, tasks, calendarEvents } from "../shared/schema";
import * as fs from "fs";
import * as path from "path";

async function exportData() {
  console.log("Exporting development data...");

  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const allUsers = await db.select().from(users);
  const sanitizedUsers = allUsers.map(({ password, ...rest }) => rest);
  fs.writeFileSync(path.join(dataDir, "users.json"), JSON.stringify(sanitizedUsers, null, 2));
  console.log(`Exported ${allUsers.length} users`);

  const allLocations = await db.select().from(locations);
  fs.writeFileSync(path.join(dataDir, "locations.json"), JSON.stringify(allLocations, null, 2));
  console.log(`Exported ${allLocations.length} locations`);

  const allPhysicians = await db.select().from(physicians);
  fs.writeFileSync(path.join(dataDir, "physicians.json"), JSON.stringify(allPhysicians, null, 2));
  console.log(`Exported ${allPhysicians.length} physicians`);

  const allReferrals = await db.select().from(referrals);
  fs.writeFileSync(path.join(dataDir, "referrals.json"), JSON.stringify(allReferrals, null, 2));
  console.log(`Exported ${allReferrals.length} referrals`);

  const allInteractions = await db.select().from(interactions);
  fs.writeFileSync(path.join(dataDir, "interactions.json"), JSON.stringify(allInteractions, null, 2));
  console.log(`Exported ${allInteractions.length} interactions`);

  const allTasks = await db.select().from(tasks);
  fs.writeFileSync(path.join(dataDir, "tasks.json"), JSON.stringify(allTasks, null, 2));
  console.log(`Exported ${allTasks.length} tasks`);

  const allEvents = await db.select().from(calendarEvents);
  fs.writeFileSync(path.join(dataDir, "calendar_events.json"), JSON.stringify(allEvents, null, 2));
  console.log(`Exported ${allEvents.length} calendar events`);

  console.log("Export complete!");
  process.exit(0);
}

exportData().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});
