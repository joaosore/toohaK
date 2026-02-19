'use client';

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

const buildWsUrl = () => {
  if (typeof window === 'undefined') return '';
  const envUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (envUrl) return envUrl;
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.hostname}:3001/ws`;
};

type QuestionForm = {
  text: string;
  options: string[];
  correctIndex: number;
};

type QuestionItem = {
  id: number;
  text: string;
  options: string[];
  correctIndex: number;
  position: number;
};

type QuestionState = {
  startsAt: number;
  durationMs: number;
  index: number;
  total: number;
};

type Standings = { name: string; score: number; totalTimeMs: number }[];

type ServerMessage =
  | { type: 'error'; message: string }
  | {
      type: 'question';
      id: number;
      text: string;
      options: string[];
      index: number;
      total: number;
      startsAt: number;
      durationMs: number;
    }
  | { type: 'scoreboard'; standings: Standings }
  | { type: 'quiz-ended'; standings: Standings };

export default function HostRoom() {
  const params = useParams();
  const rawCode = params?.code;
  const roomCode = Array.isArray(rawCode)
    ? (rawCode[0] ?? '')
    : typeof rawCode === 'string'
      ? rawCode
      : '';
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [form, setForm] = useState<QuestionForm>({
    text: '',
    options: ['', '', '', ''],
    correctIndex: 0,
  });
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [questionInfo, setQuestionInfo] = useState<string | null>(null);
  const [standings, setStandings] = useState<Standings>([]);
  const [roomReady, setRoomReady] = useState(false);
  const [questionActive, setQuestionActive] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState<QuestionState | null>(
    null,
  );
  const [timeLeft, setTimeLeft] = useState<number>(0);

  const wsUrl = useMemo(buildWsUrl, []);

  const loadQuestions = async () => {
    if (!roomCode) return;
    const response = await fetch(`/api/rooms/${roomCode}/questions`);
    if (response.ok) {
      const data = (await response.json()) as { questions: QuestionItem[] };
      setQuestions(data.questions);
    }
  };

  const ensureRoom = async () => {
    if (!roomCode) return;
    const response = await fetch(`/api/rooms/${roomCode}`);
    if (!response.ok) return;
    const data = (await response.json()) as { exists?: boolean };
    if (!data.exists) {
      await fetch(`/api/rooms/${roomCode}`, { method: 'POST' });
    }
    setRoomReady(true);
  };

  useEffect(() => {
    if (!roomCode) return;
    setRoomReady(false);
    ensureRoom().then(loadQuestions);
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode || !roomReady) return;
    if (!wsUrl) return;
    const socket = new WebSocket(wsUrl);
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'join', role: 'host', roomCode }));
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === 'error') {
        setError(message.message);
        return;
      }
      if (message.type === 'question') {
        setQuestionInfo(
          `Questao ${message.index} de ${message.total} em andamento.`,
        );
        setQuestionActive(true);
        setActiveQuestion({
          startsAt: message.startsAt,
          durationMs: message.durationMs,
          index: message.index,
          total: message.total,
        });
      }
      if (message.type === 'scoreboard') {
        setStandings(message.standings);
        setQuestionInfo('Rodada encerrada.');
        setQuestionActive(false);
        setActiveQuestion(null);
      }
      if (message.type === 'quiz-ended') {
        setStandings(message.standings);
        setQuestionInfo('Quiz encerrado.');
        setQuestionActive(false);
        setActiveQuestion(null);
      }
    };
    socket.onclose = () => setWs(null);
    setWs(socket);
    return () => socket.close();
  }, [roomCode, roomReady, wsUrl]);

  useEffect(() => {
    if (!activeQuestion) return;

    const updateTimeLeft = () => {
      const elapsed = Date.now() - activeQuestion.startsAt;
      const remaining = Math.max(0, activeQuestion.durationMs - elapsed);
      setTimeLeft(Math.ceil(remaining / 1000));
    };

    updateTimeLeft();
    const interval = setInterval(updateTimeLeft, 250);
    return () => clearInterval(interval);
  }, [activeQuestion]);

  const handleAddQuestion = async () => {
    if (!roomCode) return;
    setError(null);
    const response = await fetch(`/api/rooms/${roomCode}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: form.text,
        options: form.options,
        correctIndex: form.correctIndex,
      }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? 'Erro ao adicionar pergunta.');
      return;
    }

    setForm({ text: '', options: ['', '', '', ''], correctIndex: 0 });
    loadQuestions();
  };

  const handleStart = () => {
    if (!roomCode) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError('Conexao do host ainda nao esta pronta.');
      return;
    }
    ws?.send(JSON.stringify({ type: 'host-start', roomCode }));
  };

  const handleNext = () => {
    if (!roomCode) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError('Conexao do host ainda nao esta pronta.');
      return;
    }
    ws?.send(JSON.stringify({ type: 'host-next', roomCode }));
  };

  return (
    <div className="shell">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-2">
          <p className="label">Sala {roomCode}</p>
          <h1 className="text-3xl font-semibold">Painel do host</h1>
          <p className="text-sm text-[var(--ink-muted)]">
            Compartilhe o codigo da sala com os participantes.
          </p>
        </header>

        <section className="card p-8">
          <h2 className="text-xl font-semibold">Adicionar pergunta</h2>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-2">
              <span className="label">Pergunta</span>
              <input
                className="input"
                value={form.text}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, text: event.target.value }))
                }
              />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              {form.options.map((option, index) => (
                <label className="grid gap-2" key={`option-${index}`}>
                  <span className="label">Alternativa {index + 1}</span>
                  <input
                    className="input"
                    value={option}
                    onChange={(event) => {
                      const next = [...form.options];
                      next[index] = event.target.value;
                      setForm((prev) => ({ ...prev, options: next }));
                    }}
                  />
                </label>
              ))}
            </div>
            <label className="grid gap-2">
              <span className="label">Alternativa correta</span>
              <select
                className="input"
                value={form.correctIndex}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    correctIndex: Number(event.target.value),
                  }))
                }
              >
                {form.options.map((_, index) => (
                  <option key={`correct-${index}`} value={index}>
                    Alternativa {index + 1}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
          <button className="btn-primary mt-6" onClick={handleAddQuestion}>
            Salvar pergunta
          </button>
        </section>

        <section className="card p-8">
          <h2 className="text-xl font-semibold">Controle do quiz</h2>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            {questionInfo ?? 'Aguardando inicio.'} As questoes avancam sozinhas.
          </p>
          {questionActive ? (
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              Tempo restante: {timeLeft}s
            </p>
          ) : null}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button className="btn-primary" onClick={handleStart}>
              Iniciar quiz
            </button>
          </div>
        </section>

        <section className="card p-8">
          <h2 className="text-xl font-semibold">Perguntas cadastradas</h2>
          <div className="mt-4 grid gap-4">
            {questions.length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)]">
                Nenhuma pergunta cadastrada ainda.
              </p>
            ) : (
              questions.map((question) => (
                <div
                  key={question.id}
                  className="rounded-2xl border border-black/10 bg-white/60 p-4"
                >
                  <p className="text-sm text-[var(--ink-muted)]">
                    #{question.position}
                  </p>
                  <p className="mt-1 font-semibold">{question.text}</p>
                  <ul className="mt-3 grid gap-2 text-sm text-[var(--ink-soft)]">
                    {question.options.map((option, index) => (
                      <li key={`${question.id}-opt-${index}`}>
                        {index + 1}. {option}
                        {index === question.correctIndex ? ' (correta)' : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="card p-8">
          <h2 className="text-xl font-semibold">Ranking</h2>
          <div className="mt-4 grid gap-3">
            {standings.length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)]">
                O ranking aparece ao final de cada rodada.
              </p>
            ) : (
              standings.map((entry, index) => (
                <div
                  key={`${entry.name}-${index}`}
                  className="flex items-center justify-between rounded-2xl border border-black/10 bg-white/70 p-3"
                >
                  <span className="font-semibold">{entry.name}</span>
                  <span className="text-sm text-[var(--ink-muted)]">
                    {entry.score} pts · {Math.round(entry.totalTimeMs / 1000)}s
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
