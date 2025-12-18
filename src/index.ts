import "dotenv/config";
import { downgradeExpiredSubscriptions } from "./jobs/downgradeExpiredSubscriptions";

async function main() {
    try {
        console.log("🕒 Render cron job started");

        await downgradeExpiredSubscriptions();

        console.log("✅ Cron job completed: downgradeExpiredSubscriptions");
        process.exit(0);
    } catch (err) {
        console.error("❌ Cron job failed:", err);
        process.exit(1);
    }
}

main();
