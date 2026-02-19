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

type QuestionState = {
  id: number;
  text: string;
  options: string[];
  index: number;
  total: number;
  startsAt: number;
  durationMs: number;
};

type Standings = { name: string; score: number; totalTimeMs: number }[];

type ServerMessage =
  | { type: 'error'; message: string }
  | { type: 'room-joined'; role: 'participant'; roomCode: string }
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

export default function ParticipantRoom() {
  const params = useParams();
  const rawCode = params?.code;
  const roomCode = Array.isArray(rawCode)
    ? (rawCode[0] ?? '')
    : typeof rawCode === 'string'
      ? rawCode
      : '';
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState<QuestionState | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [standings, setStandings] = useState<Standings>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [roomValid, setRoomValid] = useState(false);
  const [quizEnded, setQuizEnded] = useState(false);

  const wsUrl = useMemo(buildWsUrl, []);

  useEffect(() => {
    const stored = sessionStorage.getItem('katoot-name') ?? '';
    setName(stored);
  }, []);

  useEffect(() => {
    if (!roomCode) return;
    const checkRoom = async () => {
      const response = await fetch(`/api/rooms/${roomCode}`);
      if (!response.ok) {
        setRoomValid(false);
        setError('Sala nao encontrada.');
        return;
      }
      const data = (await response.json()) as { exists?: boolean };
      if (!data.exists) {
        setRoomValid(false);
        setError('Sala nao encontrada.');
        return;
      }
      setRoomValid(true);
    };
    checkRoom();
  }, [roomCode]);

  useEffect(() => {
    if (!name || !wsUrl || !roomValid) return;

    const socket = new WebSocket(wsUrl);
    socket.onopen = () => {
      socket.send(
        JSON.stringify({ type: 'join', role: 'participant', roomCode, name }),
      );
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === 'error') {
        setError(message.message);
        return;
      }
      if (message.type === 'question') {
        setQuestion(message);
        setSelectedIndex(null);
        setError(null);
        setStandings([]);
        setQuizEnded(false);
      }
      if (message.type === 'scoreboard') {
        setStandings(message.standings);
        setQuestion(null);
      }
      if (message.type === 'quiz-ended') {
        setStandings(message.standings);
        setQuestion(null);
        setQuizEnded(true);
      }
    };
    socket.onclose = () => setWs(null);
    setWs(socket);
    return () => socket.close();
  }, [name, roomCode, roomValid, wsUrl]);

  useEffect(() => {
    if (!question) return;

    const updateTimeLeft = () => {
      const elapsed = Date.now() - question.startsAt;
      const remaining = Math.max(0, question.durationMs - elapsed);
      setTimeLeft(Math.ceil(remaining / 1000));
    };

    updateTimeLeft();
    const interval = setInterval(updateTimeLeft, 250);
    return () => clearInterval(interval);
  }, [question]);

  const handleAnswer = (index: number) => {
    if (!question || selectedIndex !== null) return;
    setSelectedIndex(index);
    ws?.send(
      JSON.stringify({
        type: 'answer',
        roomCode,
        questionId: question.id,
        optionIndex: index,
      }),
    );
  };

  if (!name) {
    return (
      <div className="shell">
        <main className="mx-auto w-full max-w-3xl">
          <div className="card p-10">
            <h1 className="text-3xl font-semibold">Nome necessario</h1>
            <p className="mt-3 text-sm text-[var(--ink-muted)]">
              Volte e informe seu nome para entrar na sala.
            </p>
            <a
              className="btn-primary mt-6 inline-flex w-full justify-center"
              href="/play"
            >
              Voltar
            </a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="shell">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <header className="flex flex-col gap-2">
          <p className="label">Sala {roomCode}</p>
          <h1 className="text-3xl font-semibold">Ola, {name}</h1>
          <p className="text-sm text-[var(--ink-muted)]">
            Responda rapido. Cada questao vale 10 pontos.
          </p>
        </header>

        {error ? (
          <div className="card p-6">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : null}

        {question ? (
          <section className="card p-8">
            <div className="flex items-center justify-between">
              <p className="label">
                Questao {question.index} / {question.total}
              </p>
              <p className="text-sm text-[var(--ink-muted)]">
                Tempo: {timeLeft}s
              </p>
            </div>
            <h2 className="mt-4 text-2xl font-semibold">{question.text}</h2>
            <div className="mt-6 grid gap-3">
              {question.options.map((option, index) => (
                <button
                  key={`answer-${index}`}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    selectedIndex === index
                      ? 'border-[var(--accent-strong)] bg-[#fff1e8]'
                      : 'border-black/10 bg-white/70 hover:border-black/30'
                  }`}
                  onClick={() => handleAnswer(index)}
                  disabled={selectedIndex !== null || timeLeft === 0}
                >
                  <span className="font-semibold">{index + 1}.</span> {option}
                </button>
              ))}
            </div>
          </section>
        ) : quizEnded ? (
          <section className="card p-8">
            <h2 className="text-xl font-semibold">Quiz finalizado</h2>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              Obrigado por participar. Confira o ranking final.
            </p>
          </section>
        ) : (
          <section className="card p-8">
            <h2 className="text-xl font-semibold">Aguardando pergunta...</h2>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              O host vai iniciar a proxima rodada em instantes.
            </p>
          </section>
        )}

        <section className="card p-8">
          <h2 className="text-xl font-semibold">Ranking atual</h2>
          <div className="mt-4 grid gap-3">
            {standings.length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)]">
                O ranking aparece quando a rodada termina.
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
