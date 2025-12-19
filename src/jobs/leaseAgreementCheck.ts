import { pool } from "../db/pool";
import type { RowDataPacket } from "mysql2/promise";

type LeaseRow = RowDataPacket & {
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

        for (const lease of renewalLeases) {
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
        }

        console.log("🎯 Lease expiration cron completed successfully.");
    } finally {
        connection.release();
    }
}
