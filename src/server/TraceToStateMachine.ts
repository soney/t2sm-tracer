/* tslint:disable:prefer-for-of */
import { extend, isEqual } from 'lodash';
import { FSM } from 't2sm';
import { cloneIntoFSM } from '../utils/cloneIntoFSM';
import { ICTTStateData, ICTTTransitionData, ITraceTreeState, ITraceTreeTransition } from '../utils/FSMInterfaces';
import { HashMap } from './HashMap';


export class TraceToStateMachine {
    private traceFSMs: Map<string, FSM<ICTTStateData, ICTTTransitionData>> = new Map();
    private traceTree: FSM<ITraceTreeState, ITraceTreeTransition> = new FSM();
    private outputFSM: FSM<ITraceTreeState, ITraceTreeTransition> = new FSM();

    public constructor(private similarityScore: SimilarityScore<any> = defaultSimilarityScore, private transitionsEqual: EqualityCheck<any> = defaultEqualityCheck) {
        return;
    }

    public addUserFSM(userID: string, fsm: FSM<ICTTStateData, ICTTTransitionData>): void {
        this.traceFSMs.set(userID, fsm);
        this.updateTraceTree(userID);
        cloneIntoFSM(this.traceTree, this.outputFSM);
        condenseFSM(this.outputFSM, this.transitionsEqual, this.similarityScore);
        fsm.addListener('transitionAdded', () => {
            this.updateTraceTree(userID);
            cloneIntoFSM(this.traceTree, this.outputFSM);
            condenseFSM(this.outputFSM, this.transitionsEqual, this.similarityScore);
        });
    }

    public removeUserFSM(userID: string): void {
        this.traceFSMs.delete(userID);
    }

    public getTraceTree(): FSM<ITraceTreeState, ITraceTreeTransition> {
        return this.traceTree;
    }

    public getOutputFSM(): FSM<ITraceTreeState, ITraceTreeTransition> {
        return this.outputFSM;
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
                            const newTransitionPayload = extend({}, payload, { transitions: newPayloadTransitions }) as ITraceTreeTransition;
                            this.traceTree.setTransitionPayload(outgoingTransition, newTransitionPayload);

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
// const defaultSimilarityScore:SimilarityScore<any> = (a:any, b:any) => a===b ? 1 : 0;
// const defaultEqualityCheck:EqualityCheck<any> = (a:any, b:any) => isEqual(a, b);

function defaultEqualityCheck (a: any, b: any): boolean {
    const eventTypesEqual = a.eventType === b.eventType;
    return eventTypesEqual && isEqual(extend({}, a.target, { parent: null }), extend({}, b.target, { parent: null }));
}

function defaultSimilarityScore (a: any, b: any): number {
    const ie = defaultEqualityCheck(a, b);
    return ie ? 1 : -1;
}

/**
 * Merge two states together
 */
export function mergeStates(fsm: FSM<any, any>, removeState:string, mergeInto:string, transitionsEqual: EqualityCheck<any>, getNewPayload: (rmPay: any, intPay: any) => any, removeStaleStates: boolean = true):void {
    const mergeIntoOutgoingTransitions = fsm.getOutgoingTransitions(mergeInto);
    const outgoingTransitionTargets = new Set<string>();

    console.log(`Merge ${removeState} into ${mergeInto}:\n${fsm.toString()}`);


    let outgoingTransitions: string[];

    do {
        outgoingTransitions = fsm.getOutgoingTransitions(removeState);
        if (outgoingTransitions.length > 0) {
            const t = outgoingTransitions[0];
            const tPayload = fsm.getTransitionPayload(t);
            let hasConflict: boolean = false;
            let conflictingTransition: string = '';
            let conflictingTransitionPayload: any;

            for (const i in mergeIntoOutgoingTransitions) {
                if (mergeIntoOutgoingTransitions.hasOwnProperty(i)) {
                    const t2 = mergeIntoOutgoingTransitions[i];
                    const t2Payload = fsm.getTransitionPayload(t2);

                    if (transitionsEqual(tPayload, t2Payload)) {
                        hasConflict = true;
                        conflictingTransition = t2;
                        conflictingTransitionPayload = t2Payload;
                        break;
                    }
                }
            }

            if (hasConflict) {
                if (removeStaleStates) {
                    outgoingTransitionTargets.add(fsm.getTransitionTo(t));
                }
                const newTransitionPayload = getNewPayload(conflictingTransitionPayload, tPayload);
                fsm.setTransitionPayload(conflictingTransition, newTransitionPayload);
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
        while (true) {
            let removedAny: boolean = false;
            outgoingTransitionTargets.forEach((state) => {
                if (fsm.getIncomingTransitions(state).length === 0) {
                    fsm.removeState(state);
                    removedAny = true;
                }
            });
            if (!removedAny) {
                break;
            }
        }
    }
    console.log(`${fsm.toString()}`);
}

function condenseFSM(fsm: FSM<any, any>, transitionsEqual: EqualityCheck<any>, scoreSimilarity: SimilarityScore<any>): void {
    let hasMerged: boolean = true;
    do {
        hasMerged = iterateMerge(fsm, 4, transitionsEqual, scoreSimilarity);
    } while (hasMerged);
}

/**
 * Iterate and merge the best candidates
 */
function iterateMerge(fsm: FSM<any, any>, minThreshold: number, transitionsEqual: EqualityCheck<any>, scoreSimilarity: SimilarityScore<any>): boolean {
    const similarityScores = computeSimilarityScores(fsm, 2, scoreSimilarity);
    const sortedStates = Array.from(similarityScores.entries()).sort((a, b) => b[1]-a[1]);

    if(sortedStates.length > 0) {
        const [toMergeS1, toMergeS2] = sortedStates[0][0];
        const score = sortedStates[0][1];
        if (score > minThreshold) {
            mergeStates(fsm, toMergeS1, toMergeS2, transitionsEqual, (removePayload: ITraceTreeTransition, mergeIntoPayload: ITraceTreeTransition) => {
                const newTransitions = extend({}, removePayload.transitions, mergeIntoPayload.transitions);
                const newPayload = extend({}, mergeIntoPayload, { transitions: newTransitions } );
                console.log(newPayload.transitions);
                return newPayload;
            });
            return true;
        }
    }
    return false;
}

/**
 * @returns every possible pairing of states
 */
function getStatePairs(fsm: FSM<any, any>):Array<Pair<string>> {
    const rv: Array<Pair<string>> = [];
    const states = fsm.getStates().filter((s) => s !== fsm.getStartState());
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
 * @returns every possible pairing of transitions
 */
function getTransitionPairs(fsm: FSM<any, any>):Array<Pair<string>> {
    const rv: Array<Pair<string>> = [];
    const outgoingFromStartState = fsm.getOutgoingTransitions(fsm.getStartState());
    // Exclude transition  from the start state
    const transitions = fsm.getTransitions().filter((t) => outgoingFromStartState.indexOf(t) < 0);
    for(let i:number = 0; i<transitions.length; i++) {
        const ti = transitions[i];
        for(let j:number = i+1; j<transitions.length; j++) {
            const tj = transitions[j];
            rv.push([ti, tj]);
        }
    }
    return rv;
}

function getTransitionSimilarityScores(fsm: FSM<any, any>, transitionPairs: Array<Pair<string>>, scoreSimilarity: SimilarityScore<any>): HashMap<Pair<string>, number> {
    const rv: HashMap<Pair<string>, number> = new HashMap(pairEq, (p) => p[0]+p[1]);
    transitionPairs.forEach(([t1, t2]) => {
        const sScore = scoreSimilarity(fsm.getTransitionPayload(t1), fsm.getTransitionPayload(t2));
        rv.set([t1, t2], sScore);
    });
    return rv;
}

/**
 * Compute a similarity score of every pair of states
 */
function computeSimilarityScores(fsm: FSM<any, any>, numStateCheckRounds: number, scoreSimilarity: SimilarityScore<any>):HashMap<Pair<string>, number> {
    const outgoingTransitionSimilarityScores = new HashMap<Pair<string>, number>(pairEqNoOrdering, hashPairNoOrdering);
    const transitionPairs = getTransitionPairs(fsm);
    const transitionSimilarityScores = getTransitionSimilarityScores(fsm, transitionPairs, scoreSimilarity);
    transitionSimilarityScores.entries().forEach(([[t1, t2], score]) => {
        const t1From = fsm.getTransitionFrom(t1);
        const t2From = fsm.getTransitionFrom(t2);
        if (t1From !== t2From) {
            const p: [string, string] = [fsm.getTransitionFrom(t1), fsm.getTransitionFrom(t2)];
            outgoingTransitionSimilarityScores.set(p, (outgoingTransitionSimilarityScores.get(p, 0) as number) + score);
        }
    });

    let previousSimilarityScores: HashMap<Pair<string>, number> = outgoingTransitionSimilarityScores.clone();
    let newSimilarityScores: HashMap<Pair<string>, number> = previousSimilarityScores;

    outgoingTransitionSimilarityScores.clear();

    for(let i: number = 0; i<numStateCheckRounds; i++) {
        newSimilarityScores = new HashMap<Pair<string>, number>(pairEqNoOrdering, hashPairNoOrdering);
        transitionSimilarityScores.entries().forEach(([[t1, t2], score]) => {
            const t1From = fsm.getTransitionFrom(t1);
            const t1To = fsm.getTransitionTo(t1);
            const t2From = fsm.getTransitionFrom(t2);
            const t2To = fsm.getTransitionTo(t2);

            if(t1From !== t2From) {
                const p: [string, string] = [t1From, t2From];
                const toSimilarity = previousSimilarityScores.get([t1To, t2To], 0) as number;
                newSimilarityScores.set(p, (previousSimilarityScores.get(p, 0) as number) + score + toSimilarity);
            }
        });
        previousSimilarityScores.clear();
        previousSimilarityScores = newSimilarityScores;
    }
    return newSimilarityScores;
    // const numCommonTransitions = new HashMap<Pair<string>, number>(pairEq, (p) => p[0] + p[1]);
    // const statePairs = getStatePairs(fsm);
    // const equivalentOutgoingTransitions:Map<Pair<string>, Array<Pair<string>>> = new Map<Pair<string>, Array<Pair<string>>>();
    // statePairs.forEach((p) => {
    //     const [state1, state2] = p;
    //     const et:Array<Pair<string>> = equivalentTransitions(fsm, fsm.getOutgoingTransitions(state1), fsm.getOutgoingTransitions(state2), transitionsEqual);
    //     equivalentOutgoingTransitions.set(p, et);
    //     numCommonTransitions.set(p, et.length);
    // });
    // console.log(statePairs);
    // const rv = new Map<Pair<string>, number>();
    // statePairs.forEach((p) => {
    //     const equivTransitions = equivalentOutgoingTransitions.get(p) as Array<Pair<string>>;
    //     console.log(equivTransitions.map((t) => fsm.getTransitionPayload(t[0]).data.target.textContent + fsm.getTransitionPayload(t[1]).data.target.textContent));
    //     equivTransitions.forEach((et) => {
    //         const [t1, t2] = et;

    //         const t1Dest = fsm.getTransitionTo(t1);
    //         const t2Dest = fsm.getTransitionTo(t2);
    //         const similarityScore:number = numCommonTransitions.get([t1Dest, t2Dest], 0) || numCommonTransitions.get([t2Dest, t1Dest], 0) as number;
    //         rv.set(p, numCommonTransitions.get(p) as number + similarityScore);
    //     });
    // });
    // numCommonTransitions.clear();
    // return rv;
}

// /**
//  * Get a list of equivalent transitions from two sets of transitions
//  * @param transitionSet1 The first set of transitions
//  * @param transitionSet2 The second set of transitions
//  * @returns A list of pairs of transitions that are common between transitionSet1 and transitionSet2
//  */
// function equivalentTransitions(fsm: FSM<any, any>, transitionSet1:string[], transitionSet2:string[], transitionsEqual: EqualityCheck<any> ):Array<Pair<string>> {
//     const rv:Array<Pair<string>> = [];
//     for(let i:number = 0; i<transitionSet1.length; i++) {
//         const t1 = transitionSet1[i];
//         for(let j:number = 0; j<transitionSet2.length; j++) {
//             const t2 = transitionSet2[j];
//             if(transitionsEqual(fsm.getTransitionPayload(t1), fsm.getTransitionPayload(t2))) {
//                 rv.push([t1, t2]);
//                 break;
//             }
//         }
//     }
//     return rv;
// }

function pairEq(p1: any, p2: any): boolean {
    return p1[0] === p2[0] && p1[1] === p2[1];
}
function pairEqNoOrdering(p1: any, p2: any): boolean {
    return (p1[0] === p2[0] && p1[1] === p2[1]) ||
        (p1[1] === p2[0] && p1[0] === p2[1]);
}
function hashPair(p: [string, string]): string {
    const [p1, p2] = p;
    return `${p1} ${p2}`;
}
function hashPairNoOrdering(p: [string, string]): string {
    const [p1, p2] = p;
    if(p1 < p2) {
        return `${p1} ${p2}`;
    } else {
        return `${p2} ${p1}`;
    }
}