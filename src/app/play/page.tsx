'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function PlayLanding() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleEnter = async () => {
    setError(null);
    setLoading(true);

    try {
      const trimmedName = name.trim();
      const trimmedCode = roomCode.trim().toUpperCase();
      if (!trimmedName || !trimmedCode) {
        setError('Informe nome e codigo da sala.');
        return;
      }

      const response = await fetch(`/api/rooms/${trimmedCode}`);
      const data = (await response.json()) as { exists?: boolean };

      if (!response.ok || !data.exists) {
        setError('Sala nao encontrada.');
        return;
      }

      sessionStorage.setItem('katoot-name', trimmedName);
      router.push(`/room/${trimmedCode}`);
    } catch (err) {
      setError('Erro ao entrar na sala.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="shell">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <div className="card p-10">
          <p className="label">Participante</p>
          <h1 className="mt-2 text-3xl font-semibold">Entre na sala</h1>
          <p className="mt-3 text-sm text-[var(--ink-muted)]">
            Digite seu nome e o codigo da sala fornecido pelo host.
          </p>
          <div className="mt-6 grid gap-4">
            <label className="grid gap-2">
              <span className="label">Seu nome</span>
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="grid gap-2">
              <span className="label">Codigo da sala</span>
              <input
                className="input"
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value)}
              />
            </label>
          </div>
          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
          <button
            className="btn-primary mt-6 w-full"
            onClick={handleEnter}
            disabled={loading}
          >
            {loading ? 'Entrando...' : 'Entrar agora'}
          </button>
        </div>
      </main>
    </div>
  );
}
