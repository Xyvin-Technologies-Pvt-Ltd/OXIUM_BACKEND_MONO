// One-off: set stationId/chargerId on OCPP sessions saved before the OCPP server
// started recording them, using each charger's CURRENT station.
//
//   npm run backfill:session-stations            (dry run: report only)
//   npm run backfill:session-stations -- --apply (write)
//
// Deploy the OCPP server change first so new sessions are recorded with their station,
// then run this. Safe to re-run: only sessions without a stationId are touched.
// Limitation: a charger moved between stations before this runs has all of its older
// sessions attributed to the station it is at now — there is no earlier history.
require("dotenv").config();
const mongoose = require("mongoose");

const APPLY = process.argv.includes("--apply");

async function run() {
  const { MONGO_URI, DB_NAME } = process.env;
  // Deliberately no fallback connection string: be explicit about which DB is changed
  if (!MONGO_URI || !DB_NAME) {
    console.error("Set MONGO_URI and DB_NAME for the database to backfill.");
    process.exit(1);
  }

  await mongoose.connect(`${MONGO_URI}/${DB_NAME}`);
  const db = mongoose.connection.db;
  const sessions = db.collection("ocpptransactions");
  console.log(`${APPLY ? "APPLYING" : "DRY RUN"} on ${DB_NAME}\n`);

  const machines = await db
    .collection("evmachines")
    .find({}, { projection: { CPID: 1, location_name: 1 } })
    .toArray();

  let toUpdate = 0;
  let updated = 0;
  for (const machine of machines) {
    if (!machine.location_name) continue;
    // stationId: null matches both missing and null
    const filter = { cpid: machine.CPID, stationId: null };
    const count = await sessions.countDocuments(filter);
    if (!count) continue;

    toUpdate += count;
    console.log(`${machine.CPID}: ${count} session(s) -> station ${machine.location_name}`);
    if (APPLY) {
      const result = await sessions.updateMany(filter, {
        $set: { stationId: machine.location_name, chargerId: machine._id },
      });
      updated += result.modifiedCount;
    }
  }

  // Sessions whose charger no longer exists (or has no station) cannot be attributed
  const knownCpids = machines.filter((m) => m.location_name).map((m) => m.CPID);
  const unattributable = await sessions
    .aggregate([
      { $match: { stationId: null, cpid: { $nin: knownCpids } } },
      { $group: { _id: "$cpid", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ])
    .toArray();

  if (APPLY) {
    await sessions.createIndex({ stationId: 1, startTime: -1 });
  }

  console.log(`\nSessions to attribute: ${toUpdate}${APPLY ? `, updated: ${updated}` : ""}`);
  if (unattributable.length) {
    console.log("Sessions left without a station (charger deleted or has no station):");
    for (const row of unattributable) console.log(`  ${row._id}: ${row.count}`);
  }
  if (!APPLY) console.log("\nNothing was changed. Re-run with --apply to write.");

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
