import { NextResponse } from 'next/server';
import { createRoom } from '@/lib/db';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

const generateRoomCode = () => {
  return randomBytes(3).toString('hex').toUpperCase();
};

export async function POST() {
  const roomCode = generateRoomCode();
  await createRoom(roomCode);
  return NextResponse.json({ roomCode });
}
