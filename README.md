# Singchat
Sure, here's all the previous information formatted as a comprehensive README.md file, ready to be copied for your GitLab or GitHub repository.signchat-web-prototipo🎯 Integración Lógica de la API SignChat en Sistemas de Mensajería WebEste proyecto representa la culminación de la fase de Despliegue y Entrega del Prototipo, validando la integración eficiente de la lógica de traducción de la API SignChat en un entorno web111111111.El modelo de configuración Back-End fue diseñado para ser replicable, permitiendo que terceros sistemas de mensajería adopten fácilmente la solución para una comunicación inclusiva sordo-oyente222222222.💻 Arquitectura y Tecnologías ClaveLa solución sigue una arquitectura de N-Capas con un enfoque en microservicios desacoplados3333. El servidor Node.js actúa como Orquestador y Proxy para los servicios de traducción externos, manteniendo una comunicación de baja latencia con los clientes a través de WebSockets4444444.ComponenteTecnologíaPropósito en la Integración Servidor (Back-End)Node.js (Express)Entorno de ejecución asíncrono, esencial como Orquestador de la API y manejador de rutas HTTP6.Comunicación en Tiempo RealWebSockets (Socket.IO)Protocolo Full-Duplex para comunicación instantánea, garantizando baja latencia y sincronización de mensajes7.Base de Datos (OLTP)PostgreSQL (Neon)Almacenamiento transaccional para asegurar la persistencia (durabilidad) del historial de mensajes8888.Consumo de API ExternaFetch API (Node.js/JS)Permite realizar solicitudes asíncronas (POST y GET) a los microservicios de traducción de SignChat9.⚙️ Estructura y Pasos de Configuración1. Estructura del Repositorio/signchat-web-prototipo
├── .env                  # Variables de entorno (URL Base de la API, Conexión DB)
├── package.json          # Metadatos y dependencias (Express, Socket.IO, pg)
├── server.js             # 🎯 BACK-END: Lógica central, orquestación, WebSockets
└── /public
    ├── index.html        # 🎨 FRONT-END: Estructura HTML y lógica de cliente Socket.IO
    ├── style.css         # 🖼️ Estilos del chat y teclado LSC
    └── client.js         # Lógica del cliente (manejo de DOM, envío/recepción de mensajes)
2. Configuración del Entorno (.env)Crea un archivo llamado .env en la raíz del proyecto. Esta configuración es crucial para la replicabilidad10.Bash# Archivo .env
# Variables críticas para la replicabilidad y el despliegue

# URL base del microservicio de SignChat API:
# Define el endpoint principal para que el orquestador sepa a dónde llamar.
SIGNCHAT_BASE="https://signchat.co/ms-traductor"

# Cadena de conexión para la Base de Datos Transaccional (PostgreSQL/Neon).
# Es necesario para la persistencia de mensajes.
DATABASE_URL="postgresql://neondb_owner:npgUnABNXIFLd13@ep-solitary-recipe-a5a6himo-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require" 

# Puerto de ejecución del servidor Node.js
PORT=3000
3. Contrato de la API SignChat (Rutas Proxy)El servidor Node.js (server.js) expone las siguientes rutas como Proxies internos, las cuales consumen los microservicios de la API externa11:Módulo de TraducciónRuta Local (Proxy)MétodoEnvío (Body)RespuestaObservaciones Texto a Seña/api/txt-to-imgPOSTJSON ({ "text": "..." })JSON ({ "images": [URL...] })El Back-End aplica Normalización de URL a las imágenes.Seña a Texto/api/img-to-txtPOSTJSON ({ "images": [URL...] })JSON ({ "text": "..." })Retorna el texto plano.Teclado LSC/api/keyboard-lscGETN/Atext/htmlRetorna el fragmento HTML del teclado.4. Bloques de Código Esenciales (Lógica Replicable)A. Back-End Orquestador (server.js)Lógica de Proxy, Normalización y Manejo de ErroresEsta función maneja la ruta para la traducción de texto a señas, implementando la corrección de rutas de imágenes (Normalización de URL) y el manejo de excepciones de red/servicio (códigos 400, 503, 502)131313131313131313.JavaScript// Fragmento de server.js: Ruta Proxy para Texto a Seña

const express = require('express');
const fetch = require('node-fetch');
// ... otras importaciones ...

const SIGNCHAT_BASE = process.env.SIGNCHAT_BASE;
const app = express();
app.use(express.json()); 

// RUTA PROXY: Texto a Seña
app.post("/api/txt-to-img", async (req, res) => {
    const { text } = req.body;
    if (!text) {
        // 400 Bad Request: Campo obligatorio ausente
        return res.status(400).json({ error: "El campo 'text' es obligatorio" });
    }

    try {
        const r = await fetch(`${SIGNCHAT_BASE}/translate/txt-to-img.php`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        });

        if (!r.ok) {
            // 503 Service Unavailable: Error de API externa
            const errorText = await r.text().catch(() => "N/A");
            return res.status(r.status).json({
                error: "Fallo de conexión con el microservicio de traducción",
                detail: errorText
            });
        }
        
        const data = await r.json();

        // 🎯 Lógica de Corrección/Normalización de URL (CRÍTICO)
        if (Array.isArray(data?.images)) {
            data.images = data.images.map(url =>
                url.replace('http://localhost/signchat_dev/ms-traductor/', `${SIGNCHAT_BASE}/`)
            );
        }

        return res.json(data); // 200 OK: URLs corregidas
        
    } catch (e) {
        // 502 Bad Gateway: Error de red/timeout
        console.error("Error al orquestar la llamada a la API:", e);
        return res.status(502).json({ error: "No se pudo alcanzar la API externa de SignChat" });
    }
});
Comunicación en Tiempo Real y Persistencia (Socket.IO + PG)Implementa la conexión bidireccional, garantiza la persistencia del mensaje y lo difunde a todos los clientes14141414.JavaScript// Fragmento de server.js: Lógica de WebSockets y Persistencia

const { Server } = require('socket.io');
const { Pool } = require('pg');
// ... otras importaciones ...

const pool = new Pool({ /* ... config de DATABASE_URL ... */ }); 
const io = new Server(servidor); // 'servidor' debe ser inicializado con Express

io.on("connection", async (socket) => {
    console.log(`Cliente conectado: ${socket.id}`);
    const username = socket.handshake.auth?.username ?? 'Anónimo'; 

    // (Aquí se incluye la lógica para la Recuperación del Historial desde PostgreSQL)

    // Recepción, Persistencia Transaccional y Difusión
    socket.on("chat message", async (msg) => {
        try {
            // 1. Inserción Transaccional (Atomicidad/Durabilidad)
            const query = `INSERT INTO messages (content, username) VALUES ($1, $2) RETURNING id;`;
            const result = await pool.query(query, [msg, username]);
            const messageId = result.rows[0].id.toString();

            // 2. Difusión Global (Inmediatez)
            io.emit("chat message", msg, messageId, username); 

        } catch (e) {
            console.error("Fallo de persistencia en DB:", e);
        }
    });
    
    socket.on("disconnect", () => {
        console.log("Cliente desconectado");
    });
});
// ... Levantar servidor ...
B. Lógica del Cliente (client.js)Implementa la conexión Socket.IO, la selección de modalidad, y la lógica para solicitar y renderizar la traducción15151515.JavaScript// Fragmento de client.js: Recepción de mensajes y Renderizado Bimodal

import { io } from "https://cdn.socket.io/4.3.2/socket.io.esm.min.js";

// 1. Conexión Socket.IO (Configuración de identidad)
const username = prompt("Ingrese su nombre de usuario:");
const socket = io({ 
    auth: { username: username, serverOffset: 0 } 
});

// Función de Consumo al Back-End (Proxy) para Texto a Seña
async function fetchSignImages(text) {
    const TXT2IMG_API = "/api/txt-to-img"; // Llama al proxy orquestador local
    
    const r = await fetch(TXT2IMG_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
    });
    
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || "Error de traducción bimodal");
    return Array.isArray(data.images) ? data.images : [];
}

// 2. Recepción y Traducción Bimodal en Tiempo Real (RF15)
socket.on("chat message", (msg, messageId, username) => {
    const isSordoMode = localStorage.getItem('mode') === 'sordo'; 
    const messageContainer = document.createElement('li');
    
    // El cliente Modo Seña solicita la traducción al proxy
    if (isSordoMode) {
        fetchSignImages(msg).then(urls => { 
            // Renderiza la secuencia de imágenes LSC (usando URLs corregidas por el Back-End)
            urls.forEach(url => {
                const img = document.createElement('img');
                img.src = url;
                messageContainer.appendChild(img);
            });
        }).catch(err => {
             // Fallback a texto o error si la traducción falla
             messageContainer.textContent = `[Error LSC] ${msg}`; 
        });
    } else {
        // El cliente Modo Oyente muestra el texto plano
        messageContainer.textContent = `${username}: ${msg}`;
    }
    
    // ... Lógica para añadir el mensaje al DOM ...
});
