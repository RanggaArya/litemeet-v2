import twilio from 'twilio';

export async function GET() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    const client = twilio(accountSid, authToken);

    try {

        const token = await client.tokens.create();

        return Response.json({
            iceServers: token.iceServers,
        });
    } catch (error) {
        console.error("Twilio Error:", error);
        return Response.json({ error: "Gagal ambil token" }, { status: 500 });
    }
}