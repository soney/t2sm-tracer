import * as express from 'express';
import * as http from 'http';
import { keys } from 'lodash';
import * as path from 'path';
import { SDBDoc, SDBServer } from 'sdb-ts';
import { FSM } from 't2sm';
import { SDBBinding } from 't2sm/built/bindings/sharedb_binding';
import * as WebSocket from 'ws';
import { ICTTStateData, ICTTTransitionData } from '../utils/ClientTraceTracker';
import { TraceToStateMachine } from '../utils/TraceToStateMachine';

export class TraceTrackerServer {
    private app: express.Application;
    private server: http.Server;
    private wss: WebSocket.Server;
    private sdbServer: SDBServer;
    private inputDoc: SDBDoc<any>;
    private outputDoc: SDBDoc<any>;
    private bindings: Map<string, SDBBinding> = new Map();
    private traceTreeBinding: SDBBinding;
    private ttsm: TraceToStateMachine = new TraceToStateMachine();
    public constructor(private port: number) {
        this.app = express();
        this.app.use(express.static(path.join(__dirname, 'client_pages')));

        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({ server: this.server });
        this.sdbServer = new SDBServer(this.wss);
        this.inputDoc = this.sdbServer.get('t2sm', 'userTraces');
        this.inputDoc.createIfEmpty({});
        this.inputDoc.subscribe(this.onUserTracesUpdate);

        this.outputDoc = this.sdbServer.get('t2sm', 'generatedFSMs');
        this.outputDoc.createIfEmpty({
            'traceTree': {}
        }).then(() => {
            this.traceTreeBinding = new SDBBinding(this.outputDoc, ['traceTree'], this.ttsm.getTraceTree());
        });
    }

    public listen(): void {
        this.server.listen(this.port);
        console.log(`Listening on port ${this.port}`);
    }

    private addUserFSM(userID: string): void {
        const binding = new SDBBinding(this.inputDoc, [userID]);
        this.bindings.set(userID, binding);
        this.ttsm.addUserFSM(userID, binding.getFSM());
    }

    private removeUserFSM(userID: string): void {
        this.ttsm.removeUserFSM(userID);
    }

    private onUserTracesUpdate = (type: string, ops: any[]): void => {
        if(type === 'op') {
            ops.forEach((op) => {
                const { p, oi, od } = op;
                if (p.length === 1) {
                    const userID = p[0];
                    if (oi) {
                        this.addUserFSM(userID);
                    } else {
                        this.removeUserFSM(userID);
                    }
                }
            });
        } else {
            keys(this.inputDoc.getData()).forEach((userID) => {
                this.addUserFSM(userID);
            });
        }
    }
};

const server = new TraceTrackerServer(8000);
server.listen();