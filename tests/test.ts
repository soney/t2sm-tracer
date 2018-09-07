import { FSM } from 't2sm';
import { TraceToStateMachine } from '../src/server/TraceToStateMachine';
import { ICTTStateData, ICTTTransitionData, ITraceTreeState, ITraceTreeTransition } from '../src/utils/FSMInterfaces';
// tslint:disable-next-line:no-var-requires
// const { TraceToStateMachine } = require('../build/dist/server/TraceToStateMachine');

describe('Create a basic FSM', () => {
    const t2sm = new TraceToStateMachine();
    function doPrint(): void {
        console.log(t2sm.getOutputFSM().toString());
    }
    const outputFSM = t2sm.getOutputFSM();
    outputFSM.setStatePayloadToString((p: ITraceTreeState) => {
        return '';
    });
    outputFSM.setTransitionPayloadToString((p: ITraceTreeTransition) => {
        if(p.data.target) {
            return p.data.eventType + ' ' + p.data.target.textContent + '';
        } else {
            return ''
        }
    });
    const traces = [
        ['2'],
        ['1', '2'],
        ['1', '1', '2'],
        ['1', '1', '1', '2']
    ]
    traces.forEach((trace, i) => {
        const fsm = createTraceFSM(trace);
        const userID = `user_${i}`;
        t2sm.addUserFSM(userID, fsm);
    })
    doPrint();
});

function createTraceFSM(buttons: string[]): FSM<ICTTStateData, ICTTTransitionData> {
    const rv = new FSM<ICTTStateData, ICTTTransitionData>();
    let currentState: string = rv.addState({});
    rv.addTransition(rv.getStartState(), currentState, undefined, { eventType: '(start)', target: null, textContent: null});
    buttons.forEach((button: string) => {
        const previousState = currentState;
        currentState = rv.addState();
        const payload: ICTTTransitionData = { eventType: 'click', manualLabel: undefined, target: { textContent: button, tagName: 'button', attributes: {} } };
        rv.addTransition(previousState, currentState, undefined, payload);
    });
    return rv;
}
