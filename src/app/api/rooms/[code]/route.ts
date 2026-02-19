import { NextResponse } from 'next/server';
import { createRoom, roomExists } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const exists = await roomExists(code);
  return NextResponse.json({ exists });
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  await createRoom(code);
  return NextResponse.json({ ok: true });
}
