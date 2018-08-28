import { keys } from 'lodash';
import * as React from 'react';
import { SDBClient, SDBDoc } from 'sdb-ts';
import { FSMView } from './FSMView';
// import { FSM } from 't2sm';
// import { SDBBinding } from 't2sm/built/bindings/sharedb_binding';

interface ITraceTrackerProps {
    server: string;
};
interface ITraceTrackerState {
    userIDs: string[];
};

export class TraceTracker extends React.Component<ITraceTrackerProps, ITraceTrackerState> {
    private client: SDBClient;
    private doc: SDBDoc<any>;

    public constructor(props: ITraceTrackerProps) {
        super(props);
        this.state = {
            userIDs: []
        }
        this.client = new SDBClient(new WebSocket(this.props.server));
        this.doc = this.client.get('t2sm', 'userTraces');
        this.doc.subscribe(this.onUserTracesUpdate);
    }

    public render(): React.ReactNode {
        const userIDDisplays: React.ReactNode[] = this.state.userIDs.map((uid) => {
            return (<div key={uid}>
                {uid}:
                <FSMView doc={this.doc} path={[uid]} />
            </div>);
        });
        return <div>
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
        const data = this.doc.getData();
        const userIDs = keys(data);
        this.setState({ userIDs });
    }
};