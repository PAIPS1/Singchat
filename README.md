# signchat-web-prototipo

Integración de la lógica de traducción de la API **SignChat** en un sistema de mensajería web, validando un despliegue replicable de baja latencia con **Node.js + Express**, **WebSockets (Socket.IO)** y persistencia **PostgreSQL**.
El objetivo es que terceros puedan adoptar este orquestador como **proxy** limpio hacia los microservicios de SignChat y habilitar una **comunicación bimodal** texto↔seña en tiempo real.

---

## Tabla de contenidos

* [Arquitectura y tecnologías](#arquitectura-y-tecnologías)
* [Estructura del repositorio](#estructura-del-repositorio)
* [Requisitos](#requisitos)
* [Configuración del entorno](#configuración-del-entorno)
* [Arranque rápido](#arranque-rápido)
* [Esquema de base de datos](#esquema-de-base-de-datos)
* [Contrato de API (proxy)](#contrato-de-api-proxy)
* [Bloques de código esenciales](#bloques-de-código-esenciales)

  * [Servidor: orquestación y WebSockets](#servidor-orquestación-y-websockets)
  * [Cliente: lógica bimodal](#cliente-lógica-bimodal)
  * [HTML mínimo de ejemplo](#html-mínimo-de-ejemplo)
* [Comandos útiles](#comandos-útiles)
* [Despliegue en producción](#despliegue-en-producción)
* [Seguridad y buenas prácticas](#seguridad-y-buenas-prácticas)
* [Solución de problemas](#solución-de-problemas)
* [Licencia](#licencia)

---

## Arquitectura y tecnologías

Arquitectura en N-capas con un orquestador **stateless** y un **OLTP** para historial de mensajes.

```
[Cliente (HTML/JS)] -- Socket.IO --> [Node.js/Express] -- fetch --> [SignChat API]
           |                                 |
           |                                 +-- pg --> [PostgreSQL (Neon o local)]
           |
           +-- fetch /api/* -----------------/
```

| Componente                  | Tecnología              | Propósito en la integración                                   |
| --------------------------- | ----------------------- | ------------------------------------------------------------- |
| Servidor (Back-End)         | Node.js (Express)       | Orquestador, rutas HTTP y proxy hacia la API SignChat         |
| Comunicación en tiempo real | WebSockets (Socket.IO)  | Canal full-duplex, baja latencia y sincronización de mensajes |
| Base de datos transaccional | PostgreSQL (Neon/local) | Persistencia duradera del historial                           |
| Consumo de microservicios   | Fetch API (Node/JS)     | Llamadas asíncronas a microservicios de traducción SignChat   |

---

## Estructura del repositorio

```
signchat-web-prototipo/
├── .env.example            # Variables de entorno de referencia (no subir secretos)
├── package.json            # Dependencias y scripts
├── server.js               # Lógica central: Express + Socket.IO + Proxy + PG
└── public/
    ├── index.html          # UI de chat y selector de modo
    ├── style.css           # Estilos del chat y del teclado LSC
    └── client.js           # Lógica de cliente: DOM, Socket.IO, fetch al proxy
```

> Mantén tu `.env` fuera del control de versiones. Usa `.env.example` como plantilla.

---

## Requisitos

* Node.js 18+ o 20+
* npm 9+
* PostgreSQL accesible (Neon o instancia local)
* Conectividad saliente hacia la API de SignChat

---

## Configuración del entorno

Crea un archivo `.env` en la raíz basado en `.env.example`:

```bash
# .env
# Endpoint base del microservicio de SignChat (sin slash final)
SIGNCHAT_BASE="https://signchat.co/ms-traductor"

# Cadena de conexión PostgreSQL (usa tus credenciales; no compartas secretos)
# Formato típico:
# DATABASE_URL="postgresql://usuario:password@host:puerto/base?sslmode=require"
DATABASE_URL="postgresql://<usuario>:<password>@<host>/<base>?sslmode=require"

# Puerto local del orquestador
PORT=3000
```

No compartas credenciales reales en commits, issues o wikis.

---

## Arranque rápido

Instala dependencias y ejecuta en modo desarrollo:

```bash
npm install
npm run dev
```

Por defecto, la app quedará en `http://localhost:3000`.

Prueba del proxy Texto→Seña:

```bash
curl -s -X POST http://localhost:3000/api/txt-to-img \
  -H "Content-Type: application/json" \
  -d '{"text":"hola"}' | jq
```

---

## Esquema de base de datos

Crea la tabla mínima para persistir mensajes:

```sql
-- schema.sql
CREATE TABLE IF NOT EXISTS messages (
  id          BIGSERIAL PRIMARY KEY,
  content     TEXT NOT NULL,
  username    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
```

Aplica el esquema con tu herramienta preferida o vía `psql`:

```bash
psql "$DATABASE_URL" -f schema.sql
```

---

## Contrato de API (proxy)

Rutas locales que el **orquestador** expone y que, a su vez, consumen la API externa de SignChat.

| Módulo                  | Ruta local          | Método | Body de entrada            | Respuesta (200)            | Observaciones                                                                                     |
| ----------------------- | ------------------- | ------ | -------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| Texto → Seña (imágenes) | `/api/txt-to-img`   | POST   | `{"text": "..."}`          | `{"images": ["URL", ...]}` | Normaliza URLs devueltas por el microservicio. Propaga errores con códigos 4xx/5xx cuando aplica. |
| Seña → Texto            | `/api/img-to-txt`   | POST   | `{"images": ["URL", ...]}` | `{"text": "..."}`          | Retorna texto plano.                                                                              |
| Teclado LSC             | `/api/keyboard-lsc` | GET    | N/A                        | `text/html`                | Retorna HTML del teclado LSC para incrustar.                                                      |

---

## Bloques de código esenciales

### Servidor: orquestación y WebSockets

`server.js` (extracto autocontenido)

```js
// server.js
require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const { Server } = require('socket.io');
const { createServer } = require('http');
const { Pool } = require('pg');
const path = require('path');

const SIGNCHAT_BASE = process.env.SIGNCHAT_BASE;
one;
const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;

if (!SIGNCHAT_BASE) {
  throw new Error("Falta SIGNCHAT_BASE en .env");
}
if (!DATABASE_URL) {
  throw new Error("Falta DATABASE_URL en .env");
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({ connectionString: DATABASE_URL });

// Salud
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, signchat: !!SIGNCHAT_BASE });
  } catch {
    res.status(503).json({ ok: false });
  }
});

// Proxy: Texto → Seña
app.post('/api/txt-to-img', async (req, res) => {
  const { text } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: "El campo 'text' es obligatorio" });
  }
  try {
    const r = await fetch(`${SIGNCHAT_BASE}/translate/txt-to-img.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const isOk = r.ok;
    const payload = await r.text();
    if (!isOk) {
      return res.status(r.status).json({
        error: 'Fallo de conexión con el microservicio de traducción',
        detail: payload
      });
    }
    let data;
    try {
      data = JSON.parse(payload);
    } catch {
      return res.status(502).json({ error: 'Respuesta no JSON desde microservicio' });
    }

    if (Array.isArray(data?.images)) {
      data.images = data.images.map(url =>
        String(url).replace(
          'http://localhost/signchat_dev/ms-traductor/',
          `${SIGNCHAT_BASE}/`
        )
      );
    }
    return res.json(data);
  } catch (e) {
    console.error('Error proxy txt-to-img:', e);
    return res.status(502).json({ error: 'No se pudo alcanzar la API externa de SignChat' });
  }
});

// Proxy: Seña → Texto
app.post('/api/img-to-txt', async (req, res) => {
  const { images } = req.body || {};
  if (!Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: "El campo 'images' debe ser un arreglo con URLs" });
  }
  try {
    const r = await fetch(`${SIGNCHAT_BASE}/translate/img-to-txt.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images })
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data) {
      return res.status(r.status || 502).json({ error: 'Fallo en microservicio' });
    }
    return res.json(data);
  } catch (e) {
    console.error('Error proxy img-to-txt:', e);
    return res.status(502).json({ error: 'No se pudo alcanzar la API externa de SignChat' });
  }
});

// Proxy: Teclado LSC
app.get('/api/keyboard-lsc', async (_req, res) => {
  try {
    const r = await fetch(`${SIGNCHAT_BASE}/keyboard/lsc.html`);
    const html = await r.text();
    if (!r.ok) return res.status(r.status).send(html);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (e) {
    console.error('Error teclado LSC:', e);
    return res.status(502).send('No fue posible obtener el teclado LSC');
  }
});

// Socket.IO
io.on('connection', async (socket) => {
  const username = socket.handshake.auth?.username || 'Anónimo';
  console.log(`Cliente conectado: ${socket.id} (${username})`);

  try {
    const { rows } = await pool.query(
      `SELECT id, content, username, created_at
       FROM messages ORDER BY created_at DESC LIMIT 30`
    );
    socket.emit('history', rows.reverse());
  } catch (e) {
    console.error('Error obteniendo historial:', e);
  }

  socket.on('chat message', async (msg) => {
    if (typeof msg !== 'string' || msg.trim() === '') return;
    try {
      const q = `INSERT INTO messages (content, username)
                 VALUES ($1, $2) RETURNING id, created_at`;
      const result = await pool.query(q, [msg, username]);
      const { id, created_at } = result.rows[0];
      io.emit('chat message', { id, content: msg, username, created_at });
    } catch (e) {
      console.error('Fallo de persistencia en DB:', e);
      socket.emit('error', { message: 'No se pudo persistir el mensaje' });
    }
  });

  socket.on('disconnect', () => {
    console.log('Cliente desconectado');
  });
});

httpServer.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
```

### Cliente: lógica bimodal

`public/client.js`

```js
// public/client.js
import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

const modeKey = 'mode'; // 'sordo' | 'oyente'
const username = prompt("Ingrese su nombre de usuario:") || 'Anónimo';

// Conexión Socket.IO con identidad básica
const socket = io({
  auth: { username }
});

// Utilidades DOM
const form = document.getElementById('form');
const input = document.getElementById('input');
const list = document.getElementById('messages');
const modeToggle = document.getElementById('mode-toggle');

function setMode(m) { localStorage.setItem(modeKey, m); }
function getMode() { return localStorage.getItem(modeKey) || 'oyente'; }

// Render de un mensaje
async function renderMessage({ id, content, username: user, created_at }) {
  const li = document.createElement('li');
  li.dataset.id = id;

  if (getMode() === 'sordo') {
    try {
      const urls = await fetchSignImages(content);
      if (Array.isArray(urls) && urls.length) {
        urls.forEach((u) => {
          const img = document.createElement('img');
          img.src = u;
          img.alt = content;
          img.loading = 'lazy';
          img.className = 'lsc-frame';
          li.appendChild(img);
        });
      } else {
        li.textContent = `[Sin LSC] ${user}: ${content}`;
      }
    } catch {
      li.textContent = `[Error LSC] ${user}: ${content}`;
    }
  } else {
    li.textContent = `${user}: ${content}`;
  }

  list.appendChild(li);
  li.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

// Consumo del proxy Texto→Seña
async function fetchSignImages(text) {
  const r = await fetch('/api/txt-to-img', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error || 'Error de traducción bimodal');
  return Array.isArray(data.images) ? data.images : [];
}

// Historial inicial
socket.on('history', (rows) => {
  list.innerHTML = '';
  rows.forEach(renderMessage);
});

// Mensajes en tiempo real
socket.on('chat message', (msg) => {
  renderMessage(msg);
});

// Envío de mensajes
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const value = input.value.trim();
  if (value) {
    socket.emit('chat message', value);
    input.value = '';
  }
});

// Cambio de modo
modeToggle.addEventListener('click', () => {
  const next = getMode() === 'sordo' ? 'oyente' : 'sordo';
  setMode(next);
  modeToggle.textContent = `Modo: ${next.toUpperCase()}`;
});
```

### HTML mínimo de ejemplo

`public/index.html`

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>SignChat Demo</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="./style.css" rel="stylesheet">
</head>
<body>
  <header>
    <h1>Chat Bimodal SignChat</h1>
    <button id="mode-toggle">Modo: OYENTE</button>
  </header>

  <main>
    <ul id="messages" class="messages"></ul>
  </main>

  <footer>
    <form id="form" autocomplete="off">
      <input id="input" placeholder="Escribe un mensaje..." />
      <button type="submit">Enviar</button>
    </form>
  </footer>

  <script type="module" src="./client.js"></script>
  <script>
    // Inicializa el label del botón según localStorage
    (function(){
      const mode = localStorage.getItem('mode') || 'oyente';
      document.getElementById('mode-toggle').textContent = `Modo: ${mode.toUpperCase()}`;
    })();
  </script>
</body>
</html>
```

`public/style.css`

```css
:root { --bg:#0f1115; --panel:#161920; --fg:#e6e6e6; --muted:#9aa4b2; }
* { box-sizing: border-box; }
body { margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:var(--bg); color:var(--fg); }
header, footer { background:var(--panel); padding:12px 16px; display:flex; align-items:center; gap:12px; }
h1 { margin:0; font-size:18px; }
button { background:#2a2f3a; color:var(--fg); border:1px solid #303646; padding:8px 12px; border-radius:8px; cursor:pointer; }
button:hover { filter:brightness(1.1); }
main { padding:16px; }
.messages { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:12px; }
.messages li { background:#11141a; border:1px solid #252b3a; border-radius:10px; padding:10px; }
footer form { display:flex; gap:8px; width:100%; }
#input { flex:1; padding:10px 12px; border-radius:10px; border:1px solid #303646; background:#0d1016; color:var(--fg); }
.lsc-frame { max-height:56px; margin-right:6px; vertical-align:middle; border-radius:6px; border:1px solid #252b3a; }
```

---

## Comandos útiles

`package.json` (incluye scripts):

```json
{
  "name": "signchat-web-prototipo",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "dev": "node --watch server.js",
    "start": "node server.js",
    "lint": "eslint .",
    "health": "curl -s http://localhost:${PORT:-3000}/health || true"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "node-fetch": "^2.7.0",
    "pg": "^8.12.0",
    "socket.io": "^4.7.5"
  }
}
```

---

## Despliegue en producción


* **Base de datos**: Neon/Cloud con `sslmode=require`.
* Configura CORS si el front-end vive en otro dominio.

---

## Seguridad y buenas prácticas

* No publiques `DATABASE_URL` ni secretos.
* Principio de privilegios mínimos en PostgreSQL.
* Validación estricta de entradas.
* Propaga códigos/errores sin filtrar secretos.
* Registra fallos operativos, evita logs con datos sensibles.

---

## Solución de problemas

* **DB no conecta**: verifica `DATABASE_URL` y `sslmode`. En Neon, exige `sslmode=require`.
* **502/503 en `/api/txt-to-img`**: el microservicio puede estar caído o responder con error; revisa `detail`.
* **Sin imágenes en modo sordo**: confirma normalización de URLs del proxy.
* **WebSockets no conectan**: revisa que el proxy inverso transfiera `Upgrade: websocket`.

---

## Licencia

MIT.
