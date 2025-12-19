import {processLeaseExpirations} from "../../../../jobs/leaseAgreementCheck";

export async function POST(req: Request) {
    const auth = req.headers.get("authorization");

    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return new Response("Unauthorized", { status: 401 });
    }

    await processLeaseExpirations();

    return Response.json({
        success: true,
        ranAt: new Date().toISOString(),
    });
}
