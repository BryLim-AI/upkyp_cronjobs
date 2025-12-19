import { pool } from "../db/pool";
import type { RowDataPacket } from "mysql2/promise";

type ExpiredSubscriptionRow = RowDataPacket & {
    landlord_id: number;
};

export async function downgradeExpiredSubscriptions() {
    const today = new Date().toISOString().split("T")[0];

    console.log(
        `🚀 Running Downgrade Expired Subscriptions Cron (${new Date().toISOString()})`
    );

    const connection = await pool.getConnection();

    try {
        const [expiredSubscriptions] = await connection.query<
            ExpiredSubscriptionRow[]
        >(
            `
      SELECT landlord_id
      FROM Subscription
      WHERE end_date < ?
        AND is_active = 1
      `,
            [today]
        );

        if (expiredSubscriptions.length === 0) {
            console.log("✅ No expired subscriptions found.");
            return;
        }

        console.log(
            `⚠️ Found ${expiredSubscriptions.length} expired subscription(s). Downgrading...`
        );

        for (const sub of expiredSubscriptions) {
            try {
                await connection.query(
                    `
          UPDATE Subscription
          SET
            plan_name = 'Free Plan',
            is_active = 1,
            is_trial = 0,
            start_date = CURDATE(),
            end_date = DATE_ADD(CURDATE(), INTERVAL 1 YEAR),
            payment_status = 'paid',
            updated_at = NOW()
          WHERE landlord_id = ?
          `,
                    [sub.landlord_id]
                );

                console.log(`✅ Downgraded landlord_id: ${sub.landlord_id}`);
            } catch (err: any) {
                console.error(
                    `❌ Failed to downgrade landlord_id ${sub.landlord_id}:`,
                    err.message
                );
            }
        }

        console.log("🎯 Downgrade process completed successfully.");
    } finally {
        connection.release();
    }
}
