import Pusher from 'pusher';

const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.NEXT_PUBLIC_PUSHER_KEY,
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
    useTLS: true,
});

export async function POST(req) {
    const data = await req.formData();
    const socketId = data.get('socket_id');
    const channelName = data.get('channel_name');

    const authResponse = pusher.authenticate(socketId, channelName);

    return Response.json(authResponse);
}