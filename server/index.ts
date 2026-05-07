import { app, httpServer, initializeApp, log } from "./app";

let appReady = false;

app.use((req, res, next) => {
  if (!appReady && !req.path.startsWith("/health")) {
    return res.status(503).json({ message: "Server is starting up, please wait..." });
  }
  next();
});

const port = parseInt(process.env.PORT || "5000", 10);
httpServer.listen(
  {
    port,
    host: "0.0.0.0",
  },
  () => {
    log(`serving on port ${port}`);

    (async () => {
      try {
        await initializeApp();

        if (process.env.NODE_ENV !== "production") {
          const { setupVite } = await import("./vite");
          await setupVite(httpServer, app);
        }

        appReady = true;
        log("Application fully initialized");

        const { ensureSearchIndexes } = await import("./db");
        await ensureSearchIndexes().catch(err => console.error("Index error:", err));

        const { seed, seedReferringProvidersRoster, seedReferralsRoster, seedProviderDeclineAlerts } = await import("./seed");
        await seed().catch(err => console.error("Seed error:", err));
        await seedReferringProvidersRoster().catch(err =>
          console.error("Provider roster seed error:", err),
        );
        await seedReferralsRoster().catch(err =>
          console.error("Referrals roster seed error:", err),
        );
        await seedProviderDeclineAlerts().catch(err =>
          console.error("Provider decline alerts seed error:", err),
        );

        const { importRealFinancials } = await import("./import-real-financials");
        await importRealFinancials().catch(err => console.error("Financial import error:", err));

        const { scheduleETL } = await import("./etl");
        scheduleETL();
      } catch (err) {
        console.error("Failed to initialize application:", err);
        process.exit(1);
      }
    })();
  },
);
