import * as express from 'express';
import * as http from 'http';
import * as path from 'path';
import { SDBServer } from 'sdb-ts';
import * as WebSocket from 'ws';

const PORT = 8000;

const app = express();
app.use(express.static(path.join(__dirname, 'client_pages')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const sdbServer = new SDBServer(wss);
const userTracesDoc = sdbServer.get('t2sm', 'userTraces');
userTracesDoc.createIfEmpty({});

server.listen(PORT);
console.log(`Listening on port ${PORT}`);