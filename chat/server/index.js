import express from "express";
import logger from "morgan";
import { createServer } from "node:http";
import { Server } from "socket.io";
import pkg from 'pg';
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import { error } from "node:console";

const { Pool } = pkg; //conexión de pool a postgres

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = process.env.PORT ?? 3000;
const app = express();
const servidor = createServer(app); // Crear el servidor HTTP con Express
const io = new Server(servidor); // Asociar Socket.IO al servidor HTTP

const ROOT_DIR = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "cliente");
// Configuración de PostgreSQL
const pool = new Pool({
    connectionString: 'postgresql://neondb_owner:npg_UnA0NXiFLdI3@ep-solitary-recipe-a5a6h1mo-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require',
    ssl: { rejectUnauthorized: false } // Permite la conexión SSL sin verificación estricta
});

// Función para crear la tabla "messages" si no existe
async function setupDatabase() {
    try {
        const client = await pool.connect();
        console.log('Conexión exitosa a PostgreSQL');

        // Crear la tabla si aún no ha sido creada
        await client.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                content TEXT NOT NULL,
                username TEXT NOT NULL
            )
        `);
        client.release();
    } catch (err) {
        console.error('Error en la conexión a la base de datos:', err);
        process.exit(1); // Cierra el proceso si no se puede conectar a la base de datos
    }
}

// Configurar eventos de Socket.IO
io.on("connection", async (socket) => {
    console.log("Cliente conectado");

    // Manejo de mensajes enviados por el cliente
    socket.on("chat message", async (msg) => {
        // Obtener el nombre de usuario autenticado o asignar "anonymous"
        const username = socket.handshake.auth?.username ?? 'anonymous';
        console.log({ username, msg });

        try {
            // Insertar el mensaje en la base de datos
            const query = `INSERT INTO messages (content, username) VALUES ($1, $2) RETURNING id`;
            const values = [msg, username];

            const result = await pool.query(query, values);

            // Emitir el mensaje a todos los clientes conectados
            io.emit("chat message", msg, result.rows[0].id.toString(), username);
        } catch (e) {
            console.error("Error al insertar mensaje:", e);
        }
    });

    // Recuperar mensajes antiguos si el cliente no tiene mensajes previos
    if (!socket.recovered) {
        try {
            // Consultar los mensajes existentes en la base de datos
            const query = `SELECT id, content, username FROM messages ORDER BY id ASC`;
            const results = await pool.query(query);

            // Enviar cada mensaje recuperado al cliente recién conectado
            results.rows.forEach(row => {
                socket.emit("chat message", row.content, row.id.toString(), row.username);
            });
        } catch (e) {
            console.error("Error al recuperar mensajes:", e);
        }
    }

    // Manejo de la desconexión del cliente
    socket.on("disconnect", () => {
        console.log("Cliente desconectado");
    });
});

// Configurar middleware para registrar las solicitudes HTTP
app.use(logger("dev"));// se va encender la ejecución con la palabra dev 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));//posiblita el uso de links 
app.use(cors()); //posibilita que se haga uso del api en peticiones de navegador
// Ruta principal para servir el archivo HTML del cliente
//----------------------------------------------------------------------------
//---------------------MICROSERVICIO SIGNCHAT---------------------------------
//----------------------------------------------------------------------------
const SIGNCHAT_BASE = process.env.SIGNCHAT_BASE || "https://signchat.co/ms-traductor";
//API SIGNCHAT TXT => IMG
//se hace funcion async para que no bloquee el flujo de la información
app.post("/api/txt-to-img", async (req, res) => {
    const { text } = req.body;
    if (!text)
        return res.status(400).json({
            error: "El campo de texto es obligatorio"
        });
    try {
        const r = await fetch(`${SIGNCHAT_BASE}/translate/txt-to-img.php`, {
            method: "POST",                         // Es POST porque el servicio espera un body con el texto.
            headers: { "Content-Type": "application/json" }, // Indicamos que el cuerpo es JSON.
            body: JSON.stringify({ text })
        });
        if (!r.ok) { // si el servidor respondio con error
            const t = await r.text().catch(() => "")//lee el parametro, para guardarlo 
            return res.status(503).json({
                error: "Fallo en el intento de conectarse con el microservicio de traducción",
                detail: t //lo que devolvio el servidor 
            });
        }
        const data = await r.json(); //la idea es que en data se guarden las imagenes
        //aca debe cambiarse el texto a la lsc 
        if (Array.isArray(data?.images)){
            data.images = data.images.map(url => 
                url.replace('http://localhost/signchat_dev/ms-traductor/','https://signchat.co/ms-traductor/')
            );
        }
        return res.json(data);
    } catch (e) {
        console.error(e);
        return res.status(502).json({ error: "no se puede traducir a LSC" });
    }
});
//-------------------------------------------------------
// API IMG A TXT 
app.post("/api/img-to-txt", async(req,res)=> {
    try{
        const r = await fetch(`${SIGNCHAT_BASE}/translate/img-to-txt.php`,{
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify(req.body)
        });
        if (!r.ok){
            const t= await r.text().catch(()=>"")
            return res.status(503).json({
                error:"Fallo la comunicación con el microservicio",
                detail: t
            });
        }
        const data= await r.json();
        return res.json(data);//el api devuelve el texto traducido 
    }catch (e){
        console.error("Error en /api/img-to-txt", e);
        return res.status(502).json({error: "no se pudo traducir de imagen a texto"})
    }
});
//-------------------------------------------------------------
// API SIGNCHAT TECLADO LSC
app.get("/api/keyboard-lsc", async(req,res) =>{
    try{
         const r = await fetch(`${SIGNCHAT_BASE}/keyboard.php`, {
            method:"GET"
        });
        if(!r.ok){
            return res.status(503).json({
                error: "Fallo en el intento de conectar con el microservicio",
                detail: await r.text().catch(()=>"")
            });
        }
        const htmlContent = await r.text();
        const fixedHtml = htmlContent.replace(/http:\/\/localhost\/signchat_dev\/ms-traductor/g, () => SIGNCHAT_BASE);
        res.setHeader('Content-Type', 'text/html'); // Especificar que la respuesta es HTML
        return res.send(fixedHtml);
        
    }catch (e){
        console.error("Error obteniendo el teclado");
        return res.status(502).json({error: "No se pudo obtener el teclado LSC"})
    }
});
//------------ZONA DE RUTAS -----------------------------
app.use(express.static(PUBLIC_DIR));
// Rutas HTML explícitas
app.get("/", (req, res) => {
    // D:\chat\cliente\index.html
    res.sendFile("index.html", { root: PUBLIC_DIR });
});

app.get("/chat", (req, res) => {
    // D:\chat\cliente\chat\chat.html
    res.sendFile(path.join("chat", "chat.html"), { root: PUBLIC_DIR });
});
// Iniciar el servidor solo después de verificar la base de datos
(async () => {
    await setupDatabase(); // Verifica que la base de datos esté lista antes de aceptar conexiones

    servidor.listen(port, () => {
        console.log(`Servidor en ejecución en http://localhost:${port}`);
    });
})();
