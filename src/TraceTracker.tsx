import { keys } from 'lodash';
import * as React from 'react';
import { SDBClient, SDBDoc } from 'sdb-ts';
import { SDBBinding } from 't2sm/built/bindings/sharedb_binding';
import { FSMView } from './FSMView';
// import { FSM } from 't2sm';

interface ITraceTrackerProps {
    server: string;
};
interface ITraceTrackerState {
    userIDs: string[];
};

export class TraceTracker extends React.Component<ITraceTrackerProps, ITraceTrackerState> {
    private client: SDBClient;
    private tracesDoc: SDBDoc<any>;
    private generatedFSMsDoc: SDBDoc<any>;
    private traceTreeBinding: SDBBinding;

    public constructor(props: ITraceTrackerProps) {
        super(props);
        this.state = {
            userIDs: []
        }
        this.client = new SDBClient(new WebSocket(this.props.server));
        this.tracesDoc = this.client.get('t2sm', 'userTraces');
        this.tracesDoc.subscribe(this.onUserTracesUpdate);
        this.generatedFSMsDoc = this.client.get('t2sm', 'generatedFSMs');
        this.generatedFSMsDoc.subscribe();
    }

    public render(): React.ReactNode {
        const userIDDisplays: React.ReactNode[] = this.state.userIDs.map((uid) => {
            return (<div key={uid}>
                <h2>{uid}</h2>
                <FSMView doc={this.tracesDoc} path={[uid]} />
            </div>);
        });
        return <div>
            <h1>Output</h1>
            <FSMView doc={this.generatedFSMsDoc} path={['outputFSM']} />
            <h1>Traces</h1>
            <FSMView doc={this.generatedFSMsDoc} path={['traceTree']} />
            {userIDDisplays}
        </div>;
    }

    private onUserTracesUpdate = (type: string, ops: any[]): void => {
        if(type === 'op') {
            ops.forEach((op) => {
                const { p } = op;
                if (p.length === 1) {
                    this.updateUserIDs();
                }
            });
        } else {
            this.updateUserIDs();
        }
    }

    private updateUserIDs(): void {
        const data = this.tracesDoc.getData();
        const userIDs = keys(data);
        this.setState({ userIDs });
    }
};