export default function Home() {
  return (
    <div className="shell">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-12">
        <section className="flex flex-col gap-6 text-center">
          <p className="label">Quiz em tempo real</p>
          <h1 className="text-4xl font-semibold leading-tight text-balance md:text-6xl">
            Katoot deixa a sala pulsando a cada pergunta.
          </h1>
          <p className="text-base text-[var(--ink-soft)] md:text-lg">
            Host cria a sala, participantes entram, respondem em ate 60 segundos
            e o ranking aparece em tempo real.
          </p>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="card p-8">
            <h2 className="text-2xl font-semibold">Sou Host</h2>
            <p className="mt-3 text-sm text-[var(--ink-muted)]">
              Crie a sala, cadastre perguntas e controle o ritmo do quiz.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <a className="btn-primary text-center" href="/host">
                Criar sala
              </a>
              <a className="btn-outline text-center" href="/host">
                Acessar painel
              </a>
            </div>
          </div>

          <div className="card p-8">
            <h2 className="text-2xl font-semibold">Sou Participante</h2>
            <p className="mt-3 text-sm text-[var(--ink-muted)]">
              Entre com seu nome, insira o codigo da sala e responda rapido.
            </p>
            <div className="mt-6">
              <a
                className="btn-primary inline-flex w-full justify-center"
                href="/play"
              >
                Entrar na sala
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
