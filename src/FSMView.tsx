import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { SDBDoc, SDBSubDoc } from 'sdb-ts';
import { FSM, SDBBinding } from 't2sm';
import { ForeignObjectDisplay } from 't2sm/built/views/ForeignObjectDisplay';
import { StateMachineDisplay } from 't2sm/built/views/StateMachineDisplay';
import { DISPLAY_TYPE } from 't2sm/built/views/StateMachineDisplay';

interface IStateMachineDisplayProps {
    path?: Array<string|number>;
    doc?: SDBDoc<any>;
    fsm?: FSM<any, any>;
}
interface IStateMachineDisplayState {
    value? : any
}

export enum TransitionType { START, TIMEOUT, TOUCH_GROUP }

export class FSMView extends React.Component<IStateMachineDisplayProps, IStateMachineDisplayState> {
    private stateMachineDisplay: StateMachineDisplay;
    private binding: SDBBinding;
    private fsmPromise: Promise<FSM<any, any>>;

    public constructor(props: IStateMachineDisplayProps) {
        super(props);
        if(this.props.doc && this.props.path) {
            this.fsmPromise = this.props.doc.fetch().then(() => {
                this.binding = new SDBBinding(this.props.doc as SDBDoc<any>, this.props.path as Array<string | number>);
                return this.binding.getFSM();
            });
        } else {
            this.fsmPromise = Promise.resolve(this.props.fsm as FSM<any, any>);
        }
        this.state = { };
    }

    public render(): React.ReactNode {
        return (
            <div className="fsm" ref={this.divRef} />
        );
    }

    private divRef = (el: HTMLDivElement): void => {
        if (el) {
            this.fsmPromise.then((fsm: FSM<any, any>) => {
                const display = new StateMachineDisplay(fsm, el , (fod: ForeignObjectDisplay) => {
                    const payload = fod.getPayload();
                    if(fod.getDisplayType() === DISPLAY_TYPE.STATE) {
                        return `${fod.getName()}`;
                    } else {
                        const { eventType, data, target, transitions } = payload;
                        if (transitions) {
                            if (data.target) {
                                return `${data.eventType} ${data.target.textContent}`;
                            } else {
                                return `${data.eventType}`;
                            }
                        } else if (target) {
                            return `${eventType} ${target.textContent}`;
                        } else {
                            return `${eventType}`;
                        }
                    }
                }, {
                    animationDuration: 0,
                    transitionAnimationDuration: 0
                });
            });
        }
    }
} 