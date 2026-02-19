import http from 'http';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import { getDb, listQuestions, recordResponse, roomExists } from './src/lib/db';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

type Question = {
  id: number;
  text: string;
  options: string[];
  correctIndex: number;
  position: number;
};

type ParticipantState = {
  name: string;
  score: number;
  totalTimeMs: number;
  ws: WebSocket;
  answeredCurrent: boolean;
};

type RoomState = {
  code: string;
  host?: WebSocket;
  participants: Map<string, ParticipantState>;
  questions: Question[];
  currentIndex: number;
  questionStartAt?: number;
  questionTimer?: NodeJS.Timeout;
  questionActive: boolean;
};

type ClientMessage =
  | {
      type: 'join';
      role: 'host' | 'participant';
      roomCode: string;
      name?: string;
    }
  | { type: 'host-start'; roomCode: string }
  | { type: 'host-next'; roomCode: string }
  | {
      type: 'answer';
      roomCode: string;
      questionId: number;
      optionIndex: number;
    };

type ServerMessage =
  | { type: 'error'; message: string }
  | { type: 'room-joined'; role: 'host' | 'participant'; roomCode: string }
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
  | {
      type: 'scoreboard';
      standings: { name: string; score: number; totalTimeMs: number }[];
    }
  | {
      type: 'quiz-ended';
      standings: { name: string; score: number; totalTimeMs: number }[];
    };

const rooms = new Map<string, RoomState>();
const QUESTION_DURATION_MS = 60_000;
const POINTS_PER_QUESTION = 10;

const send = (ws: WebSocket, message: ServerMessage) => {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(message));
};

const broadcast = (room: RoomState, message: ServerMessage) => {
  if (room.host) {
    send(room.host, message);
  }
  room.participants.forEach((participant) => send(participant.ws, message));
};

const getRoomState = (roomCode: string): RoomState => {
  const existing = rooms.get(roomCode);
  if (existing) return existing;

  const created: RoomState = {
    code: roomCode,
    participants: new Map(),
    questions: [],
    currentIndex: 0,
    questionActive: false,
  };
  rooms.set(roomCode, created);
  return created;
};

const getStandings = (room: RoomState) => {
  return Array.from(room.participants.values())
    .map((participant) => ({
      name: participant.name,
      score: participant.score,
      totalTimeMs: participant.totalTimeMs,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.totalTimeMs - b.totalTimeMs;
    });
};

const clearQuestionTimer = (room: RoomState) => {
  if (room.questionTimer) {
    clearTimeout(room.questionTimer);
    room.questionTimer = undefined;
  }
};

const endQuestion = (room: RoomState) => {
  room.questionActive = false;
  room.questionStartAt = undefined;
  room.participants.forEach((participant) => {
    participant.answeredCurrent = false;
  });
  clearQuestionTimer(room);
  broadcast(room, { type: 'scoreboard', standings: getStandings(room) });
};

const startQuestion = (room: RoomState) => {
  if (room.currentIndex >= room.questions.length) {
    broadcast(room, { type: 'quiz-ended', standings: getStandings(room) });
    return;
  }

  const question = room.questions[room.currentIndex];
  room.questionActive = true;
  room.questionStartAt = Date.now();
  room.participants.forEach((participant) => {
    participant.answeredCurrent = false;
  });

  broadcast(room, {
    type: 'question',
    id: question.id,
    text: question.text,
    options: question.options,
    index: room.currentIndex + 1,
    total: room.questions.length,
    startsAt: room.questionStartAt,
    durationMs: QUESTION_DURATION_MS,
  });

  clearQuestionTimer(room);
  room.questionTimer = setTimeout(() => {
    endQuestion(room);
  }, QUESTION_DURATION_MS);
};

const handleAnswer = async (
  room: RoomState,
  participant: ParticipantState,
  message: Extract<ClientMessage, { type: 'answer' }>,
) => {
  if (!room.questionActive || !room.questionStartAt) return;
  if (participant.answeredCurrent) return;

  const question = room.questions.find(
    (item) => item.id === message.questionId,
  );
  if (!question) return;

  const elapsedMs = Date.now() - room.questionStartAt;
  participant.answeredCurrent = true;

  const withinTime = elapsedMs <= QUESTION_DURATION_MS;
  const correct = withinTime && message.optionIndex === question.correctIndex;

  if (correct) {
    participant.score += POINTS_PER_QUESTION;
    participant.totalTimeMs += elapsedMs;
  }

  await recordResponse({
    roomCode: room.code,
    questionId: question.id,
    participantName: participant.name,
    answerIndex: message.optionIndex,
    isCorrect: correct,
    timeMs: elapsedMs,
  });

  const everyoneAnswered = Array.from(room.participants.values()).every(
    (entry) => entry.answeredCurrent,
  );

  if (everyoneAnswered) {
    endQuestion(room);
  }
};

const handleJoin = async (
  ws: WebSocket,
  message: Extract<ClientMessage, { type: 'join' }>,
) => {
  const { roomCode, role } = message;
  const exists = await roomExists(roomCode);
  if (!exists) {
    send(ws, { type: 'error', message: 'Sala nao encontrada.' });
    return;
  }

  const room = getRoomState(roomCode);

  if (role === 'host') {
    room.host = ws;
    send(ws, { type: 'room-joined', role: 'host', roomCode });
    return;
  }

  const name = (message.name || '').trim();
  if (!name) {
    send(ws, { type: 'error', message: 'Nome obrigatorio.' });
    return;
  }

  if (room.participants.has(name)) {
    send(ws, { type: 'error', message: 'Nome ja em uso.' });
    return;
  }

  const participant: ParticipantState = {
    name,
    score: 0,
    totalTimeMs: 0,
    ws,
    answeredCurrent: false,
  };
  room.participants.set(name, participant);
  send(ws, { type: 'room-joined', role: 'participant', roomCode });

  if (room.questionActive && room.questionStartAt) {
    const question = room.questions[room.currentIndex];
    if (question) {
      send(ws, {
        type: 'question',
        id: question.id,
        text: question.text,
        options: question.options,
        index: room.currentIndex + 1,
        total: room.questions.length,
        startsAt: room.questionStartAt,
        durationMs: QUESTION_DURATION_MS,
      });
    }
  }
};

const handleHostStart = async (
  ws: WebSocket,
  message: Extract<ClientMessage, { type: 'host-start' }>,
) => {
  const room = getRoomState(message.roomCode);
  if (room.host !== ws) {
    send(ws, { type: 'error', message: 'Somente o host pode iniciar.' });
    return;
  }

  room.questions = (await listQuestions(message.roomCode)).sort(
    (a, b) => a.position - b.position,
  );
  if (room.questions.length === 0) {
    send(ws, {
      type: 'error',
      message: 'Adicione perguntas antes de iniciar.',
    });
    return;
  }
  room.currentIndex = 0;
  startQuestion(room);
};

const handleHostNext = (
  ws: WebSocket,
  message: Extract<ClientMessage, { type: 'host-next' }>,
) => {
  const room = getRoomState(message.roomCode);
  if (room.host !== ws) {
    send(ws, { type: 'error', message: 'Somente o host pode avancar.' });
    return;
  }

  room.currentIndex += 1;
  startQuestion(room);
};

const removeSocket = (socket: WebSocket) => {
  rooms.forEach((room) => {
    if (room.host === socket) {
      room.host = undefined;
    }

    Array.from(room.participants.entries()).forEach(([name, participant]) => {
      if (participant.ws === socket) {
        room.participants.delete(name);
      }
    });
  });
};

const parseMessage = (data: WebSocket.RawData): ClientMessage | null => {
  try {
    return JSON.parse(data.toString()) as ClientMessage;
  } catch {
    return null;
  }
};

app.prepare().then(async () => {
  await getDb();

  const server = http.createServer((req, res) => {
    handle(req, res);
  });

  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.on('message', async (data) => {
      const message = parseMessage(data);
      if (!message) {
        send(ws, { type: 'error', message: 'Mensagem invalida.' });
        return;
      }

      switch (message.type) {
        case 'join':
          await handleJoin(ws, message);
          break;
        case 'host-start':
          await handleHostStart(ws, message);
          break;
        case 'host-next':
          handleHostNext(ws, message);
          break;
        case 'answer': {
          const room = rooms.get(message.roomCode);
          if (!room) return;
          const participant = Array.from(room.participants.values()).find(
            (entry) => entry.ws === ws,
          );
          if (!participant) return;
          await handleAnswer(room, participant, message);
          break;
        }
        default:
          send(ws, { type: 'error', message: 'Tipo desconhecido.' });
      }
    });

    ws.on('close', () => {
      removeSocket(ws);
    });
  });

  const port = Number(process.env.PORT || 3000);
  server.listen(port, () => {
    console.log(`Servidor pronto em http://localhost:${port}`);
  });
});
