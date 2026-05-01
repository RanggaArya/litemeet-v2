import { AccessToken } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const { room, username } = await req.json();

        if (!room || !username) {
            return NextResponse.json({ error: 'Missing room or username' }, { status: 400 });
        }

        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

        if (!apiKey || !apiSecret || !wsUrl) {
            return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
        }

        const at = new AccessToken(apiKey, apiSecret, {
            identity: username,
        });

        at.addGrant({ roomJoin: true, room: room });

        return NextResponse.json({ token: await at.toJwt() });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}