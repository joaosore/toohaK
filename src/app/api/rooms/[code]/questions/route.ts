import { NextResponse } from 'next/server';
import { addQuestion, listQuestions, roomExists } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const exists = await roomExists(code);
  if (!exists) {
    return NextResponse.json(
      { error: 'Sala nao encontrada.' },
      { status: 404 },
    );
  }

  const questions = await listQuestions(code);
  return NextResponse.json({ questions });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const exists = await roomExists(code);
  if (!exists) {
    return NextResponse.json(
      { error: 'Sala nao encontrada.' },
      { status: 404 },
    );
  }

  const body = (await request.json()) as {
    text?: string;
    options?: string[];
    correctIndex?: number;
  };

  const text = (body.text || '').trim();
  const options = Array.isArray(body.options)
    ? body.options.map((option) => option.trim())
    : [];
  const correctIndex = body.correctIndex ?? -1;

  if (!text || options.length !== 4 || options.some((option) => !option)) {
    return NextResponse.json(
      { error: 'Preencha a pergunta e as 4 alternativas.' },
      { status: 400 },
    );
  }

  if (correctIndex < 0 || correctIndex > 3) {
    return NextResponse.json(
      { error: 'Indice de resposta correta invalido.' },
      { status: 400 },
    );
  }

  await addQuestion(code, {
    text,
    options,
    correctIndex,
  });

  return NextResponse.json({ ok: true });
}
