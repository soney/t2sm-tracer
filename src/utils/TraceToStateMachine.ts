/* tslint:disable:prefer-for-of */
import { extend, isEqual } from 'lodash';
import { FSM } from 't2sm';
import { ICTTStateData, ICTTTransitionData } from './ClientTraceTracker';
import { HashMap } from './HashMap';

export interface ITraceTreeState {
    states: { [userID: string]: string };
}
export interface ITraceTreeTransition {
    transitions: { [userID: string]: string };
    data: ICTTTransitionData;
}


export class TraceToStateMachine {
    private traceFSMs: Map<string, FSM<ICTTStateData, ICTTTransitionData>> = new Map();
    private traceTree: FSM<ITraceTreeState, ITraceTreeTransition> = new FSM();

    public constructor(private transitionsEqual: EqualityCheck<any> = defaultEqualityCheck) {
        return;
    }

    public addUserFSM(userID: string, fsm: FSM<ICTTStateData, ICTTTransitionData>): void {
        this.traceFSMs.set(userID, fsm);
        this.updateTraceTree(userID);
        fsm.addListener('transitionAdded', () => {
            this.updateTraceTree(userID);
        })
    }

    public removeUserFSM(userID: string): void {
        this.traceFSMs.delete(userID);
    }

    public getTraceTree(): FSM<ITraceTreeState, ITraceTreeTransition> {
        return this.traceTree;
    }

    private updateTraceTree(userID: string): void {
        const fsm = this.traceFSMs.get(userID) as FSM<ICTTStateData, ICTTTransitionData>;
        const visitedStates: Set<string> = new Set();
        let currentState: string = fsm.getStartState();
        let ttState: string = this.traceTree.getStartState();
        while (true) {
            if (visitedStates.has(currentState)) {
                throw new Error('Circular path; invalid trace');
            } else {
                visitedStates.add(currentState);
            }

            // for(let i: number = 0; i < ttOutgoingTransitions.length; i++) {
            //     const ttot = ttOutgoingTransitions[i];
            // }

            const outgoingTransitions = fsm.getOutgoingTransitions(currentState);
            if(outgoingTransitions.length === 1) {
                const outgoingTransition = outgoingTransitions[0];
                const nextState = fsm.getTransitionTo(outgoingTransition);
                const tPayload = fsm.getTransitionPayload(outgoingTransition);

                const ttOutgoingTransitions = this.traceTree.getOutgoingTransitions(ttState);
                let closestTransition: string | null = null;
                for(const i in ttOutgoingTransitions) {
                    if (ttOutgoingTransitions.hasOwnProperty(i)) {
                        const ttot = ttOutgoingTransitions[i];
                        const payload: ITraceTreeTransition = this.traceTree.getTransitionPayload(ttot);
                        if (payload.transitions.hasOwnProperty(userID) && payload.transitions[userID] === outgoingTransition) {
                            closestTransition = ttot;
                            break;
                        } else if (this.transitionsEqual(payload.data, tPayload)) {
                            closestTransition = ttot;
                            const newPayloadTransitions = extend({}, payload.transitions);
                            newPayloadTransitions[userID] = outgoingTransition;
                            break;
                        }
                    }
                }

                if (closestTransition === null) {
                    if (currentState === fsm.getStartState() && ttState === this.traceTree.getStartState() && this.traceTree.getOutgoingTransitions(ttState).length > 0) {
                        closestTransition = this.traceTree.getOutgoingTransitions(ttState)[0];
                    } else {
                        const states = {};
                        const transitions = {};
                        states[userID] = nextState;
                        transitions[userID] = outgoingTransition;
                        const newState = this.traceTree.addState({ states });
                        closestTransition = this.traceTree.addTransition(ttState, newState, undefined, {
                            data: tPayload, transitions
                        });
                    }
                }

                ttState = this.traceTree.getTransitionTo(closestTransition);

                currentState = nextState;
            } else if (outgoingTransitions.length === 0) {
                break;
            } else {
                throw new Error('Multiple outgoing transition; invalid trace');
            }
        }
    }
}

type Pair<E> = [E, E];
export type EqualityCheck<E> = (i1:E, i2:E) => boolean;
export type SimilarityScore<E> = (i1:E, i2:E) => number;
const defaultSimilarityScore:SimilarityScore<any> = (a:any, b:any) => a===b ? 1 : 0;
// const defaultEqualityCheck:EqualityCheck<any> = (a:any, b:any) => isEqual(a, b);

function defaultEqualityCheck (a: any, b: any): boolean {
    const eventTypesEqual = a.eventType === b.eventType;
    return eventTypesEqual && isEqual(extend({}, a.target, { parent: null }), extend({}, b.target, { parent: null }));
}

/**
 * Merge two states together
 */
export function mergeStates(fsm: FSM<any, any>, removeState:string, mergeInto:string, removeStaleStates:boolean=true, transitionsEqual: EqualityCheck<any> = defaultEqualityCheck):void {
    const mergeIntoOutgoingTransitions = fsm.getOutgoingTransitions(mergeInto);
    const outgoingTransitionTargets = new Set<string>();

    let outgoingTransitions: string[];

    do {
        outgoingTransitions = fsm.getOutgoingTransitions(removeState);
        if (outgoingTransitions.length > 0) {
            const t = outgoingTransitions[0];
            const tPayload = fsm.getTransitionPayload(t);
            let hasConflict: boolean = false;

            for (const i in mergeIntoOutgoingTransitions) {
                if (mergeIntoOutgoingTransitions.hasOwnProperty(i)) {
                    const t2 = mergeIntoOutgoingTransitions[i];
                    const t2Payload = fsm.getTransitionPayload(t2);

                    if (transitionsEqual(tPayload, t2Payload)) {
                        hasConflict = true;
                        break;
                    }
                }
            }

            if (hasConflict) {
                if (removeStaleStates) {
                    outgoingTransitionTargets.add(fsm.getTransitionTo(t));
                }
                fsm.removeTransition(t);
            } else {
                fsm.setTransitionFrom(t, mergeInto);
            }
        }
    } while (outgoingTransitions.length > 0);

    let incomingTransitions: string[];

    do {
        incomingTransitions = fsm.getIncomingTransitions(removeState);
        if (incomingTransitions.length > 0) {
            const t = incomingTransitions[0];
            fsm.setTransitionTo(t, mergeInto);
        }
    } while (incomingTransitions.length > 0);

    fsm.removeState(removeState);

    if (removeStaleStates) {
        outgoingTransitionTargets.forEach((state) => {
            if (fsm.getIncomingTransitions(state).length === 0) {
                fsm.removeState(state);
            }
        });
    }
};

/**
 * Iterate and merge the best candidates
 */
function iterateMerge(fsm: FSM<any, any>, transitionsEqual: EqualityCheck<any>): void {
    const similarityScores = computeSimilarityScores(fsm, transitionsEqual);
    const sortedStates = Array.from(similarityScores.entries()).sort((a, b) => b[1]-a[1]);

    if(sortedStates.length > 0) {
        const [toMergeS1, toMergeS2] = sortedStates[0][0];
        mergeStates(fsm, toMergeS1, toMergeS2);
    }
};

/**
 * @returns every possible pairing of states
 */
function getStatePairs(fsm: FSM<any, any>):Array<Pair<string>> {
    const rv: Array<Pair<string>> = [];
    const states = fsm.getStates();
    for(let i:number = 0; i<states.length; i++) {
        const si = states[i];
        for(let j:number = i+1; j<states.length; j++) {
            const sj = states[j];
            rv.push([si, sj]);
        }
    }
    return rv;
}

/**
 * Compute a similarity score of every pair of states
 */
function computeSimilarityScores(fsm: FSM<any, any>, transitionsEqual: EqualityCheck<any>):Map<Pair<string>, number> {
    const numCommonTransitions = new HashMap<Pair<string>, number>((p1, p2) => p1[0]===p2[0] && p1[1]===p2[1], (p)=> p[0] + p[1]);
    const statePairs = getStatePairs(fsm);
    const equivalentOutgoingTransitions:Map<Pair<string>, Array<Pair<string>>> = new Map<Pair<string>, Array<Pair<string>>>();
    statePairs.forEach((p) => {
        const [state1, state2] = p;
        const et:Array<Pair<string>> = equivalentTransitions(fsm, fsm.getOutgoingTransitions(state1), fsm.getOutgoingTransitions(state2), transitionsEqual);
        equivalentOutgoingTransitions.set(p, et);
        numCommonTransitions.set(p, et.length);
    });
    const rv = new Map<Pair<string>, number>();
    statePairs.forEach((p) => {
        const equivTransitions = equivalentOutgoingTransitions.get(p) as Array<Pair<string>>;
        equivTransitions.forEach((et) => {
            const [t1, t2] = et;

            const t1Dest = fsm.getToState(t1);
            const t2Dest = fsm.getToState(t2);
            const similarityScore:number = numCommonTransitions.get([t1Dest, t2Dest]) || numCommonTransitions.get([t2Dest, t1Dest]) as number;
            rv.set(p, numCommonTransitions.get(p) as number + similarityScore);
        });
    });
    numCommonTransitions.clear();
    return rv;
};

/**
 * Get a list of equivalent transitions from two sets of transitions
 * @param transitionSet1 The first set of transitions
 * @param transitionSet2 The second set of transitions
 * @returns A list of pairs of transitions that are common between transitionSet1 and transitionSet2
 */
function equivalentTransitions(fsm: FSM<any, any>, transitionSet1:string[], transitionSet2:string[], transitionsEqual: EqualityCheck<any> ):Array<Pair<string>> {
    const rv:Array<Pair<string>> = [];
    for(let i:number = 0; i<transitionSet1.length; i++) {
        const t1 = transitionSet1[i];
        for(let j:number = 0; j<transitionSet2.length; j++) {
            const t2 = transitionSet2[j];
            if(transitionsEqual(fsm.getTransitionPayload(t1), fsm.getTransitionPayload(t2))) {
                rv.push([t1, t2]);
                break;
            }
        }
    }
    return rv;
};