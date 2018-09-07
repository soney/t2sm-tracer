import * as React from 'react';
import { SDBClient, SDBDoc } from 'sdb-ts';
import { FSMView } from './FSMView';
import { ClientTraceTracker } from './utils/ClientTraceTracker';
// import { FSM } from 't2sm';
// import { SDBBinding } from 't2sm/built/bindings/sharedb_binding';

interface ITraceGeneratorProps {
    server: string;
};
interface ITraceGeneratorState {
    userIDs: string[];
};

export class TraceGenerator extends React.Component<ITraceGeneratorProps, ITraceGeneratorState> {
    private client: SDBClient;
    private doc: SDBDoc<any>;
    private traceTracker: ClientTraceTracker;

    public constructor(props: ITraceGeneratorProps) {
        super(props);
        this.state = {
            userIDs: []
        }
        this.traceTracker = new ClientTraceTracker(this.props.server, `client_${Math.random()}`);
        this.traceTracker.getOutputFSM();
    }

    public render(): React.ReactNode {
        return <div ref={this.divRef}>
            <button onClick={this.btnClick}>Button 1</button>
            <button onClick={this.btnClick}>Button 2</button>
            <button onClick={this.btnClick}>Button 3</button>
            <button onClick={this.btnClick}>Button 4</button>
            <FSMView fsm={this.traceTracker.getOutputFSM()} />
        </div>;
    }

    private divRef = (el: HTMLDivElement) : void => {
        // setTimeout(async () => {
        //     const buttons = document.getElementsByTagName("button");

        //     this.traceTracker = new ClientTraceTracker(this.props.server, `client_${Math.random()}`);
        //     await this.traceTracker.ready;
        //     buttons[0].click();
        //     buttons[0].click();
        //     this.traceTracker = new ClientTraceTracker(this.props.server, `client_${Math.random()}`);
        //     await this.traceTracker.ready;
        //     buttons[0].click();
        //     buttons[1].click();
        //     this.traceTracker = new ClientTraceTracker(this.props.server, `client_${Math.random()}`);
        //     await this.traceTracker.ready;
        //     buttons[1].click();
        //     buttons[0].click();
        //     this.traceTracker = new ClientTraceTracker(this.props.server, `client_${Math.random()}`);
        //     await this.traceTracker.ready;
        //     buttons[1].click();
        //     buttons[1].click();
        //     this.traceTracker = new ClientTraceTracker(this.props.server, `client_${Math.random()}`);
        //     await this.traceTracker.ready;
        //     buttons[1].click();
        //     buttons[2].click();
        //     this.traceTracker = new ClientTraceTracker(this.props.server, `client_${Math.random()}`);
        //     await this.traceTracker.ready;
        //     buttons[0].click();
        //     buttons[2].click();
        // }, 1000);
    }

    private btnClick = (event: React.MouseEvent): void => {
        const target = event.target as HTMLElement;
        this.traceTracker.addEvent('click', target, 'GROUP');
    };
};