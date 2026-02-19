# Katoot

Quiz em tempo real com salas, pontuacao e desempate por menor tempo total.

## Requisitos

- Node.js 20+

## Como rodar

```bash
npm run dev
```

O frontend roda em http://localhost:3000 e o WebSocket em ws://localhost:3001/ws.
O banco local fica em `data/quiz.db`.

## Docker Compose

```bash
docker compose up --build
```

O frontend fica em http://localhost:3000 e o WebSocket em ws://localhost:3001/ws.

## Fluxos principais

- Host cria sala e cadastra perguntas.
- Participantes entram com nome e codigo da sala.
- Cada questao tem 60 segundos para resposta.
- Cada acerto vale 10 pontos.
- Em empate, vence quem tiver menor tempo total de respostas.
# toohaK
