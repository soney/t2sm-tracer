import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { SDBDoc, SDBSubDoc } from 'sdb-ts';
import { FSM, SDBBinding } from 't2sm';
import { StateMachineDisplay } from 't2sm/built/views/StateMachineDisplay';
import { DISPLAY_TYPE } from 't2sm/built/views/StateMachineDisplay';

interface IStateMachineDisplayProps {
    path: Array<string|number>;
    doc: SDBDoc<any>;
}
interface IStateMachineDisplayState {
    value? : any
}

export enum TransitionType { START, TIMEOUT, TOUCH_GROUP }

export class FSMView extends React.Component<IStateMachineDisplayProps, IStateMachineDisplayState> {
    private stateMachineDisplay: StateMachineDisplay;
    private binding: SDBBinding;
    private fsm: FSM<any, any>;

    public constructor(props: IStateMachineDisplayProps) {
        super(props);
        this.binding = new SDBBinding(this.props.doc, this.props.path);
        this.fsm = this.binding.getFSM();
        this.state = {
        };
    }

    public render(): React.ReactNode {
        return (
            <div className="fsm" ref={this.divRef} />
        );
    }

    private divRef = (el: HTMLDivElement): void => {
        if (el) {
            const display = new StateMachineDisplay(this.fsm, el);
        }
    }
} 