'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function HostLanding() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateRoom = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/rooms', { method: 'POST' });
      if (!response.ok) {
        throw new Error('Falha ao criar sala.');
      }
      const data = (await response.json()) as { roomCode: string };
      router.push(`/host/${data.roomCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="shell">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <div className="card p-10">
          <p className="label">Painel do host</p>
          <h1 className="mt-2 text-3xl font-semibold">Crie a sala do quiz</h1>
          <p className="mt-3 text-sm text-[var(--ink-muted)]">
            Gere o codigo, adicione perguntas e controle o tempo das rodadas.
          </p>
          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
          <button
            className="btn-primary mt-6 w-full"
            type="button"
            onClick={handleCreateRoom}
            disabled={loading}
          >
            {loading ? 'Criando...' : 'Criar sala agora'}
          </button>
        </div>
      </main>
    </div>
  );
}
