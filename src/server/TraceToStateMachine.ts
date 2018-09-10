import { each, extend, isEqual } from 'lodash';
import { FSM } from 't2sm';
import { SerializedFSM } from 't2sm/built/state_machine/FSM';
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
        // this.updateTraceTree(userID);
        this.traceTree.getStates().forEach((s) => {
            if(s !== this.traceTree.getStartState()) {
                this.traceTree.removeState(s);
            }
        })
        // this.traceTree.destroy();
        // this.traceTree = new FSM();
        const userIDs = Array.from(this.traceFSMs.keys());
        userIDs.forEach((uid) => {
            this.updateTraceTree(uid);
        });
        cloneIntoFSM(this.traceTree, this.outputFSM);
        condenseFSM(this.outputFSM, this.transitionsEqual, this.similarityScore);
    }

    public getTraceTree(): FSM<ITraceTreeState, ITraceTreeTransition> {
        return this.traceTree;
    }

    public getOutputFSM(): FSM<ITraceTreeState, ITraceTreeTransition> {
        return this.outputFSM;
    }

    public serializeCurrentTraces(): { [uid: string]: SerializedFSM } {
        const rv = {};
        this.traceFSMs.forEach((val: FSM<ICTTStateData, ICTTTransitionData>, uid: string) => {
            rv[uid] = val.serialize();
        });
        return rv;
    };

    public loadSerializedTraces(traces: { [uid: string]: SerializedFSM }): void {
        each(traces, (trace: SerializedFSM, uid: string) => {
            const fsm: FSM<ICTTStateData, ICTTTransitionData> = FSM.deserialize(trace);
            this.addUserFSM(uid, fsm);
        });
    }

    private updateTraceTree(userID: string): void {
        const userTraceFSM = this.traceFSMs.get(userID) as FSM<ICTTStateData, ICTTTransitionData>;
        const utVisitedState: Set<string> = new Set();
        let utCurrentState: string = userTraceFSM.getStartState();
        let ttState: string = this.traceTree.getStartState();
        while (true) {
            if (utVisitedState.has(utCurrentState)) {
                throw new Error('Circular path; invalid trace');
            } else {
                utVisitedState.add(utCurrentState);
            }

            // for(let i: number = 0; i < ttOutgoingTransitions.length; i++) {
            //     const ttot = ttOutgoingTransitions[i];
            // }

            const utOutgoingTransitions = userTraceFSM.getOutgoingTransitions(utCurrentState);
            if(utOutgoingTransitions.length === 1) {
                const utOutgoingTransition = utOutgoingTransitions[0];
                const utNextState = userTraceFSM.getTransitionTo(utOutgoingTransition);
                const utPayload = userTraceFSM.getTransitionPayload(utOutgoingTransition);

                const ttOutgoingTransitions = this.traceTree.getOutgoingTransitions(ttState);
                let ttClosestTransition: string | null = null;
                for(const i in ttOutgoingTransitions) {
                    if (ttOutgoingTransitions.hasOwnProperty(i)) {
                        const ttOutgoingTransition = ttOutgoingTransitions[i];
                        const ttPayload: ITraceTreeTransition = this.traceTree.getTransitionPayload(ttOutgoingTransition);
                        if (ttPayload.transitions.hasOwnProperty(userID) && ttPayload.transitions[userID] === utOutgoingTransition) {
                            ttClosestTransition = ttOutgoingTransition;
                            break;
                        } else if (this.transitionsEqual(ttPayload.data, utPayload)) {
                            ttClosestTransition = ttOutgoingTransition;
                            const newTTPayloadTransitions = extend({}, ttPayload.transitions);
                            newTTPayloadTransitions[userID] = utOutgoingTransition;
                            const newTTPayload = extend({}, ttPayload, { transitions: newTTPayloadTransitions }) as ITraceTreeTransition;
                            this.traceTree.setTransitionPayload(ttOutgoingTransition, newTTPayload);

                            break;
                        }
                    }
                }

                if (ttClosestTransition === null) {
                    if (utCurrentState === userTraceFSM.getStartState() && ttState === this.traceTree.getStartState() && this.traceTree.getOutgoingTransitions(ttState).length > 0) {
                        ttClosestTransition = this.traceTree.getOutgoingTransitions(ttState)[0];
                    } else {
                        const states = {};
                        const transitions = {};
                        states[userID] = utNextState;
                        transitions[userID] = utOutgoingTransition;
                        const newState = this.traceTree.addState({ states });
                        ttClosestTransition = this.traceTree.addTransition(ttState, newState, undefined, {
                            data: utPayload, transitions
                        });
                    }
                }

                ttState = this.traceTree.getTransitionTo(ttClosestTransition);

                utCurrentState = utNextState;
            } else if (utOutgoingTransitions.length === 0) {
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

function defaultEqualityCheck (a: ICTTTransitionData, b: ICTTTransitionData): boolean {
    if(a.manualLabel || b.manualLabel) {
        return a.manualLabel === b.manualLabel;
    } else {
        const eventTypesEqual = a.eventType === b.eventType;
        return eventTypesEqual && isEqual(extend({}, a.target, { parent: null }), extend({}, b.target, { parent: null }));
    }
}

function defaultSimilarityScore (a: any, b: any): number {
    const ie = defaultEqualityCheck(a, b);
    return ie ? 1 : -1;
}

/**
 * Merge two states together
 */
export function mergeStates(fsm: FSM<ITraceTreeState, ITraceTreeTransition>, removeState:string, mergeInto:string):void {
    const mergeIntoOutgoingTransitions = fsm.getOutgoingTransitions(mergeInto);
    const outgoingTransitionTargets = new Set<string>();

    // console.log(`Merge ${removeState} into ${mergeInto}:\n${fsm.toString()}`);

    let rmOutgoingTransitions: string[];

    do {
        rmOutgoingTransitions = fsm.getOutgoingTransitions(removeState);
        if (rmOutgoingTransitions.length > 0) {
            const rmOutgoingTransition = rmOutgoingTransitions[0];
            fsm.setTransitionFrom(rmOutgoingTransition, mergeInto);
        }
    } while (rmOutgoingTransitions.length > 0);

    let incomingTransitions: string[];

    do {
        incomingTransitions = fsm.getIncomingTransitions(removeState);
        if (incomingTransitions.length > 0) {
            const t = incomingTransitions[0];
            fsm.setTransitionTo(t, mergeInto);
        }
    } while (incomingTransitions.length > 0);

    fsm.removeState(removeState);
    // console.log(`${fsm.toString()}`);
}

function removeStaleStates(fsm: FSM<ITraceTreeState, ITraceTreeTransition>) {
    const candidates: Set<string> = new Set();
    const startState = fsm.getStartState();
    fsm.getStates().forEach((state) => {
        if (state !== startState) { candidates.add(state); }
    })
    while (true) {
        let removedState: string | null = null;
        candidates.forEach((state) => {
            if (fsm.getIncomingTransitions(state).length === 0) {
                fsm.removeState(state);
                removedState = state;
                candidates.delete(removedState);
            }
        });
        if (removedState === null) {
            break;
        }
    }
}

function condenseFSM(fsm: FSM<ITraceTreeState, ITraceTreeTransition>, transitionsEqual: EqualityCheck<ICTTTransitionData>, scoreSimilarity: SimilarityScore<ICTTTransitionData>): void {
    let hasMerged: boolean = true;
    do {
        hasMerged = iterateMerge(fsm, 3, transitionsEqual, scoreSimilarity);
    } while (hasMerged);

    const mergePayloads = (removePayload: ITraceTreeTransition, mergeIntoPayload: ITraceTreeTransition) => {
        const newTransitions = extend({}, removePayload.transitions, mergeIntoPayload.transitions);
        const newPayload = extend({}, mergeIntoPayload, { transitions: newTransitions } );
        return newPayload;
    }
    // Remove conflicting transitions
    fsm.getStates().forEach((state) => {
        removeConflictingTransitions(fsm, state, transitionsEqual, mergePayloads);
    });
    removeStaleStates(fsm);
}

function removeConflictingTransitions(fsm: FSM<ITraceTreeState, ITraceTreeTransition>, state: string, transitionsEqual: EqualityCheck<any>, getNewPayload: (rmPay: ITraceTreeTransition, intPay: ITraceTreeTransition) => any):void {
    let outgoingTransitions: string[] = fsm.getOutgoingTransitions(state);
    let numOutgoingTransitions: number = outgoingTransitions.length;
    for(let i: number = 0; i < numOutgoingTransitions; i++) {
        const oti = outgoingTransitions[i];
        const otiPayload = fsm.getTransitionPayload(oti);
        const equalTransitions: string[] = [oti];
        for(let j: number = i+1; j < numOutgoingTransitions; j++) {
            const otj = outgoingTransitions[j];
            const otjPayload = fsm.getTransitionPayload(otj);
            if(transitionsEqual(otiPayload.data, otjPayload.data)) {
                equalTransitions.push(otj);
            }
        }
        if (equalTransitions.length > 1) {
            const destinationsMap = new Map();
            let mostFrequentDestination: string;

            equalTransitions.forEach((t) => {
                const destination = fsm.getTransitionTo(t);
                const prevValue = destinationsMap.has(destination) ? destinationsMap.get(destination) : 0;
                destinationsMap.set(destination, prevValue + 1);
            });

            let mergeIntoIndex: number = 0; 
            if (destinationsMap.size > 1) {
                const destinationFrequencies = Array.from(destinationsMap.entries());
                const sortedDF = destinationFrequencies.sort((a, b) => b[1]-a[1]);
                mostFrequentDestination = sortedDF[0][0];

                for(let x: number = 0; x < equalTransitions.length; x++) {
                    if (fsm.getTransitionTo(equalTransitions[x]) === mostFrequentDestination) {
                        mergeIntoIndex = x;
                        break;
                    }
                }
            } else {
                mostFrequentDestination = Array.from(destinationsMap.keys())[0];
            }

            const mergeIntoTransition = equalTransitions[mergeIntoIndex];
            equalTransitions.forEach((t) => {
                if (t !== mergeIntoTransition) {
                    const rmPayload = fsm.getTransitionPayload(t);
                    const miPayload = fsm.getTransitionPayload(mergeIntoTransition);
                    fsm.setTransitionPayload(mergeIntoTransition, getNewPayload(rmPayload, miPayload));
                    fsm.removeTransition(t);
                }
            });

            outgoingTransitions = fsm.getOutgoingTransitions(state);
            numOutgoingTransitions = outgoingTransitions.length;
            i--;
        }
    }
}

/**
 * Iterate and merge the best candidates
 */
function iterateMerge(fsm: FSM<ITraceTreeState, ITraceTreeTransition>, minThreshold: number, transitionsEqual: EqualityCheck<ICTTTransitionData>, scoreSimilarity: SimilarityScore<ICTTTransitionData>): boolean {
    const similarityScores = computeSimilarityScores(fsm, 4, 0.1, transitionsEqual, scoreSimilarity);
    const sortedStates = Array.from(similarityScores.entries()).sort((a, b) => b[1]-a[1]);

    if(sortedStates.length > 0) {
        // console.log(sortedStates);
        const [toMergeS1, toMergeS2] = sortedStates[0][0];
        const score = sortedStates[0][1];
        if (score > minThreshold) {
            mergeStates(fsm, toMergeS1, toMergeS2);

            const mergePayloads = (removePayload: ITraceTreeTransition, mergeIntoPayload: ITraceTreeTransition) => {
                const newTransitions = extend({}, removePayload.transitions, mergeIntoPayload.transitions);
                const newPayload = extend({}, mergeIntoPayload, { transitions: newTransitions } );
                return newPayload;
            }
            // Remove conflicting transitions
            // removeConflictingTransitions(fsm, toMergeS2, transitionsEqual, mergePayloads);

            // console.log(`${fsm.toString()}`);
            return true;
        }
    }
    return false;
}

/**
 * @returns every possible pairing of states
 */
function getStatePairs(fsm: FSM<ITraceTreeState, ITraceTreeTransition>):Array<Pair<string>> {
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
// function getTransitionPairs(fsm: FSM<ITraceTreeState, ITraceTreeTransition>):Array<Pair<string>> {
//     const rv: Array<Pair<string>> = [];
//     const outgoingFromStartState = fsm.getOutgoingTransitions(fsm.getStartState());
//     // Exclude transition  from the start state
//     const transitions = fsm.getTransitions().filter((t) => outgoingFromStartState.indexOf(t) < 0);
//     for(let i:number = 0; i<transitions.length; i++) {
//         const ti = transitions[i];
//         for(let j:number = i+1; j<transitions.length; j++) {
//             const tj = transitions[j];
//             rv.push([ti, tj]);
//         }
//     }
//     return rv;
// }

function getTransitionSimilarityScores(fsm: FSM<ITraceTreeState, ITraceTreeTransition>, transitionPairs: Array<Pair<string>>, scoreSimilarity: SimilarityScore<ICTTTransitionData>): HashMap<Pair<string>, number> {
    const rv: HashMap<Pair<string>, number> = new HashMap(pairEq, (p) => p[0]+p[1]);
    transitionPairs.forEach(([t1, t2]) => {
        const t1Payload: ITraceTreeTransition = fsm.getTransitionPayload(t1);
        const t2Payload: ITraceTreeTransition = fsm.getTransitionPayload(t2);
        const sScore = scoreSimilarity(t1Payload.data, t2Payload.data);
        rv.set([t1, t2], sScore);
    });
    return rv;
}

/**
 * Compute a similarity score of every pair of states
 */
function computeSimilarityScores(fsm: FSM<ITraceTreeState, ITraceTreeTransition>, numStateCheckRounds: number, unmatchedPunishment: number, transitionsEqual: EqualityCheck<ICTTTransitionData>, scoreSimilarity: SimilarityScore<ICTTTransitionData>):HashMap<Pair<string>, number> {
    const statePairs = getStatePairs(fsm);
    const equivalentOutgoingTransitions:Map<Pair<string>, Array<Pair<string>>> = new Map<Pair<string>, Array<Pair<string>>>();
    const outgoingTransitionSimilarityScores = new HashMap<Pair<string>, number>(pairEqNoOrdering, hashPairNoOrdering);
    const stateSimilarityScores = new HashMap<Pair<string>, number>(pairEqNoOrdering, hashPairNoOrdering);
    statePairs.forEach((p) => {
        const [state1, state2] = p;
        let pairScore: number = 0;
        const et:IEquivalentTransitionsResult = equivalentTransitions(fsm, fsm.getOutgoingTransitions(state1), fsm.getOutgoingTransitions(state2), transitionsEqual);
        et.matchedTransitions.forEach(([t1, t2]) => {
            const t1Payload = fsm.getTransitionPayload(t1);
            const t2Payload = fsm.getTransitionPayload(t2);
            pairScore += scoreSimilarity(t1Payload.data, t2Payload.data);
            outgoingTransitionSimilarityScores.set([t1, t2], pairScore);
        });
        pairScore -= unmatchedPunishment * (et.unmatchedSet1Transitions.length + et.unmatchedSet2Transitions.length);
        stateSimilarityScores.set(p, pairScore);
    });

    // const transitionPairs = getTransitionPairs(fsm);
    // const transitionSimilarityScores = getTransitionSimilarityScores(fsm, transitionPairs, scoreSimilarity);
    // transitionSimilarityScores.entries().forEach(([[t1, t2], score]) => {
    //     const t1From = fsm.getTransitionFrom(t1);
    //     const t2From = fsm.getTransitionFrom(t2);
    //     if (t1From !== t2From) {
    //         const p: [string, string] = [fsm.getTransitionFrom(t1), fsm.getTransitionFrom(t2)];
    //         outgoingTransitionSimilarityScores.set(p, (outgoingTransitionSimilarityScores.get(p, 0) as number) + score);
    //     }
    // });

    let previousSimilarityScores: HashMap<Pair<string>, number> = stateSimilarityScores.clone();
    let newSimilarityScores: HashMap<Pair<string>, number> = previousSimilarityScores;

    for(let i: number = 0; i<numStateCheckRounds; i++) {
        newSimilarityScores = new HashMap<Pair<string>, number>(pairEqNoOrdering, hashPairNoOrdering);
        outgoingTransitionSimilarityScores.entries().forEach(([[t1, t2]]) => {
            const t1From = fsm.getTransitionFrom(t1);
            const t1To = fsm.getTransitionTo(t1);
            const t2From = fsm.getTransitionFrom(t2);
            const t2To = fsm.getTransitionTo(t2);

            if(t1From !== t2From) {
                const p: [string, string] = [t1From, t2From];
                const toSimilarity = previousSimilarityScores.get([t1To, t2To], 0) as number;
                newSimilarityScores.set(p, (previousSimilarityScores.get(p, 0) as number) + toSimilarity);
            }
        });
        previousSimilarityScores.clear();
        previousSimilarityScores = newSimilarityScores;
    }

    outgoingTransitionSimilarityScores.clear();

    return newSimilarityScores;
}

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

interface IEquivalentTransitionsResult {
    matchedTransitions: Array<Pair<string>>;
    unmatchedSet1Transitions: string[];
    unmatchedSet2Transitions: string[];
}
/**
 * Get a list of equivalent transitions from two sets of transitions
 * @param transitionSet1 The first set of transitions
 * @param transitionSet2 The second set of transitions
 * @returns A list of pairs of transitions that are common between transitionSet1 and transitionSet2
 */
function equivalentTransitions(fsm: FSM<any, any>, transitionSet1:string[], transitionSet2:string[], transitionsEqual: EqualityCheck<any> ):IEquivalentTransitionsResult {
    const unmatchedSet1Transitions: Set<string> = new Set();
    const unmatchedSet2Transitions: Set<string> = new Set();
    transitionSet1.forEach((t) => unmatchedSet1Transitions.add(t));
    transitionSet2.forEach((t) => unmatchedSet1Transitions.add(t));

    const matchedTransitions:Array<Pair<string>> = [];
    for(let i:number = 0; i<transitionSet1.length; i++) {
        const t1 = transitionSet1[i];
        for(let j:number = 0; j<transitionSet2.length; j++) {
            const t2 = transitionSet2[j];
            if(unmatchedSet2Transitions.has(t2)) {
                continue;
            } else if(transitionsEqual(fsm.getTransitionPayload(t1).data, fsm.getTransitionPayload(t2).data)) {
                matchedTransitions.push([t1, t2]);
                unmatchedSet1Transitions.delete(t1);
                unmatchedSet2Transitions.delete(t2);
                break;
            }
        }
    }
    return {
        matchedTransitions,
        unmatchedSet1Transitions: Array.from(unmatchedSet1Transitions.values()),
        unmatchedSet2Transitions: Array.from(unmatchedSet2Transitions.values()),
    };
};