import fs from 'fs/promises';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

type QuestionRow = {
  id: number;
  room_code: string;
  text: string;
  options_json: string;
  correct_index: number;
  position: number;
};

type QuestionInput = {
  text: string;
  options: string[];
  correctIndex: number;
};

type ResponseInput = {
  roomCode: string;
  questionId: number;
  participantName: string;
  answerIndex: number;
  isCorrect: boolean;
  timeMs: number;
};

let dbPromise: Promise<Database> | null = null;

const getDbFilePath = () => {
  return path.join(process.cwd(), 'data', 'quiz.db');
};

const initDb = async (db: Database) => {
  await db.exec('PRAGMA journal_mode = WAL;');
  await db.exec(
    'CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, created_at INTEGER NOT NULL);',
  );
  await db.exec(
    'CREATE TABLE IF NOT EXISTS questions (id INTEGER PRIMARY KEY AUTOINCREMENT, room_code TEXT NOT NULL, text TEXT NOT NULL, options_json TEXT NOT NULL, correct_index INTEGER NOT NULL, position INTEGER NOT NULL, FOREIGN KEY(room_code) REFERENCES rooms(code));',
  );
  await db.exec(
    'CREATE TABLE IF NOT EXISTS responses (id INTEGER PRIMARY KEY AUTOINCREMENT, room_code TEXT NOT NULL, question_id INTEGER NOT NULL, participant_name TEXT NOT NULL, answer_index INTEGER NOT NULL, is_correct INTEGER NOT NULL, time_ms INTEGER NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY(room_code) REFERENCES rooms(code), FOREIGN KEY(question_id) REFERENCES questions(id));',
  );
};

export const getDb = async () => {
  if (!dbPromise) {
    dbPromise = (async () => {
      const dataDir = path.join(process.cwd(), 'data');
      await fs.mkdir(dataDir, { recursive: true });
      const db = await open({
        filename: getDbFilePath(),
        driver: sqlite3.Database,
      });
      await initDb(db);
      return db;
    })();
  }

  return dbPromise;
};

export const roomExists = async (code: string) => {
  const db = await getDb();
  const row = await db.get('SELECT code FROM rooms WHERE code = ?', code);
  return Boolean(row);
};

export const createRoom = async (code: string) => {
  const db = await getDb();
  await db.run('INSERT OR IGNORE INTO rooms (code, created_at) VALUES (?, ?)', [
    code,
    Date.now(),
  ]);
};

export const listQuestions = async (roomCode: string) => {
  const db = await getDb();
  const rows = await db.all<QuestionRow[]>(
    'SELECT id, room_code, text, options_json, correct_index, position FROM questions WHERE room_code = ? ORDER BY position ASC',
    roomCode,
  );

  return rows.map((row) => ({
    id: row.id,
    roomCode: row.room_code,
    text: row.text,
    options: JSON.parse(row.options_json) as string[],
    correctIndex: row.correct_index,
    position: row.position,
  }));
};

export const addQuestion = async (
  roomCode: string,
  question: QuestionInput,
) => {
  const db = await getDb();
  const positionRow = await db.get<{ maxPos: number }>(
    'SELECT COALESCE(MAX(position), 0) AS maxPos FROM questions WHERE room_code = ?',
    roomCode,
  );
  const position = (positionRow?.maxPos ?? 0) + 1;

  await db.run(
    'INSERT INTO questions (room_code, text, options_json, correct_index, position) VALUES (?, ?, ?, ?, ?)',
    roomCode,
    question.text,
    JSON.stringify(question.options),
    question.correctIndex,
    position,
  );
};

export const recordResponse = async (response: ResponseInput) => {
  const db = await getDb();
  await db.run(
    'INSERT INTO responses (room_code, question_id, participant_name, answer_index, is_correct, time_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    response.roomCode,
    response.questionId,
    response.participantName,
    response.answerIndex,
    response.isCorrect ? 1 : 0,
    response.timeMs,
    Date.now(),
  );
};
