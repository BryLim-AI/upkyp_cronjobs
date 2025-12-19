import "dotenv/config";
import { pool } from "../db/pool";

type LeaseRow = {
    agreement_id: number;
    tenant_id: number;
    unit_id: number;
    end_date: string;
};

export async function processLeaseExpirations() {
    const today = new Date().toISOString().split("T")[0];

    console.log(
        `🚀 Running Lease Expiration Cron (${new Date().toISOString()})`
    );

    const connection = await pool.getConnection();

    try {
        /* ===============================
           1️⃣ EXPIRE PAST-DUE LEASES
        =============================== */
        const [expiredLeases] = await connection.query<LeaseRow[]>(
            `
      SELECT agreement_id
      FROM LeaseAgreement
      WHERE status = 'active'
        AND end_date < ?
      `,
            [today]
        );

        if (expiredLeases.length > 0) {
            console.log(
                `⚠️ Found ${expiredLeases.length} lease(s) to expire.`
            );

            await connection.query(
                `
        UPDATE LeaseAgreement
        SET status = 'expired',
            updated_at = NOW()
        WHERE status = 'active'
          AND end_date < ?
        `,
                [today]
            );

            console.log("✅ Expired leases updated successfully.");
        } else {
            console.log("✅ No leases to expire.");
        }

        /* ===============================
           2️⃣ LEASES ENDING IN 60 DAYS
        =============================== */
        const [renewalLeases] = await connection.query<LeaseRow[]>(
            `
      SELECT agreement_id, tenant_id, unit_id, end_date
      FROM LeaseAgreement
      WHERE status = 'active'
        AND end_date BETWEEN ?
        AND DATE_ADD(?, INTERVAL 60 DAY)
      `,
            [today, today]
        );

        if (renewalLeases.length === 0) {
            console.log("ℹ️ No leases within renewal window.");
            return;
        }

        console.log(
            `📣 Found ${renewalLeases.length} lease(s) eligible for renewal.`
        );

        for (const lease of renewalLeases) {
            try {
                /* OPTIONAL: Insert notification / renewal marker */
                await connection.query(
                    `
          INSERT INTO Notification (user_id, title, body, created_at)
          SELECT
            u.user_id,
            'Lease Ending Soon',
            CONCAT(
              'Your lease will end on ',
              DATE_FORMAT(?, '%M %d, %Y'),
              '. You may now request a renewal.'
            ),
            NOW()
          FROM Tenant t
          JOIN User u ON u.user_id = t.user_id
          WHERE t.tenant_id = ?
          `,
                    [lease.end_date, lease.tenant_id]
                );

                console.log(
                    `📨 Renewal notice sent for agreement_id: ${lease.agreement_id}`
                );
            } catch (err: any) {
                console.error(
                    `❌ Failed processing renewal for agreement_id ${lease.agreement_id}:`,
                    err.message
                );
            }
        }

        console.log("🎯 Lease expiration cron completed successfully.");
    } finally {
        connection.release();
    }
}

/**
 * Cron entry point
 * (Vercel / cron-job.org safe)
 */
(async () => {
    try {
        await processLeaseExpirations();
        process.exit(0);
    } catch (err) {
        console.error("❌ Lease cron crashed:", err);
        process.exit(1);
    }
})();
