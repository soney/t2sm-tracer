import { FSM } from 't2sm';

export function cloneIntoFSM(sourceFSM: FSM<any, any>, targetFSM: FSM<any, any>): void {
    const states = targetFSM.getStates().filter(s => s !== targetFSM.getStartState());
    states.forEach((s) => targetFSM.removeState(s));
    const sourceStates = sourceFSM.getStates().filter(s => s !== sourceFSM.getStartState());
    sourceStates.forEach((s) => {
        targetFSM.addState(sourceFSM.getStatePayload(s), s);
    });
    const sourceTransitions = sourceFSM.getTransitions();
    sourceTransitions.forEach((t) => {
        targetFSM.addTransition(sourceFSM.getTransitionFrom(t), sourceFSM.getTransitionTo(t), sourceFSM.getTransitionAlias(t), sourceFSM.getTransitionPayload(t), t);
    });
}