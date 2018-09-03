import { SDBClient } from 'sdb-ts/built/SDBClient';
import { SDBDoc } from 'sdb-ts/built/SDBDoc';
import { FSM } from 't2sm';
import { SDBBinding } from 't2sm/built/bindings/sharedb_binding';
import { cloneIntoFSM } from './cloneIntoFSM';
import { ICTTStateData, ICTTTransitionData, ISerializedElement, ISerializedParent, ITraceTreeState, ITraceTreeTransition } from './FSMInterfaces';


export class ClientTraceTracker {
    private static serializeElement(el: Element): ISerializedElement {
        const { tagName, parentElement, textContent } = el;
        const attributes = { };
        for(let i: number = 0; i < el.attributes.length; i++) {
            const { name, value } = el.attributes.item(i) as Attr;
            attributes[name] = value;
        }
        if (parentElement) {
            const childIndex = Array.prototype.indexOf.call(parentElement.children, el);
            const tagIndex = getImmediateChildren(parentElement, el.tagName).indexOf(el);
            const sParent = ClientTraceTracker.serializeElement(parentElement);
            return { tagName, attributes, textContent, parent: { element: sParent, childIndex, tagIndex } };
        } else {
            return { tagName, attributes, textContent };
        }
    }

    public ready: Promise<void>;

    private fsm: FSM<ICTTStateData, ICTTTransitionData> = new FSM<ICTTStateData, ICTTTransitionData>();
    private outputFSM: FSM<ITraceTreeState, ITraceTreeTransition>;
    private myOutputFSM: FSM<ITraceTreeState, ITraceTreeTransition> = new FSM();
    private ws: WebSocket;
    private sdbClient: SDBClient;
    private traceDoc: SDBDoc<any>;
    private traceFSMBinding: SDBBinding;
    private outputDoc: SDBDoc<any>;
    private outputFSMBinding: SDBBinding;
    private currentState: string;

    public constructor(serverURL: string, private clientID: string) {
        this.ready = this.initialize(serverURL, clientID);
    }

    public addEvent(eventType: string, target: HTMLElement, manualLabel?: string): void {
        const { textContent } = target;
        const sTarget = ClientTraceTracker.serializeElement(target);
        const payload: ICTTTransitionData = { eventType, manualLabel, target: sTarget };

        const previousState = this.currentState;
        this.currentState = this.fsm.addState({});
        this.fsm.addTransition(previousState, this.currentState, undefined, payload);
    }
    public getOutputFSM(): FSM<ITraceTreeState, ITraceTreeTransition> { return this.myOutputFSM; };

    public destroy() {
        this.traceFSMBinding.destroy();
    }

    private async initialize(serverURL: string, clientID: string): Promise<void> {
        this.ws = new WebSocket(serverURL);
        this.sdbClient = new SDBClient(this.ws);
        this.traceDoc = this.sdbClient.get('t2sm', 'userTraces');
        await this.traceDoc.fetch();
        this.traceFSMBinding = new SDBBinding(this.traceDoc, [clientID], this.fsm);

        this.currentState = this.fsm.addState({});
        this.fsm.addTransition(this.fsm.getStartState(), this.currentState, undefined, { eventType: '(start)', target: null });

        this.outputDoc = this.sdbClient.get('t2sm', 'generatedFSMs');
        await this.outputDoc.fetch();
        this.outputFSMBinding = new SDBBinding(this.outputDoc, ['outputFSM']);
        this.outputFSM = this.outputFSMBinding.getFSM();
        const umofsm = debounce(() => {
            console.log('UPDATE');
            this.updateMyOutputFSM();
        }, 500);
        this.outputFSM.on('stateAdded', umofsm);
        this.outputFSM.on('stateRemoved', umofsm);
        this.outputFSM.on('transitionAdded', umofsm);
        this.outputFSM.on('transitionRemoved', umofsm);
        this.outputFSM.on('transitionRenamed', umofsm);
        this.outputFSM.on('statePayloadChanged', umofsm);
        this.outputFSM.on('transitionAliasChanged', umofsm);
        this.outputFSM.on('transitionPayloadChanged', umofsm);
        this.outputFSM.on('transitionToStateChanged', umofsm);
        this.outputFSM.on('transitionFromStateChanged', umofsm);
    }

    private updateMyOutputFSM = (): void => {
        cloneIntoFSM(this.outputFSM, this.myOutputFSM);
        this.myOutputFSM.getTransitions().forEach((transition) => {
            const payload = this.myOutputFSM.getTransitionPayload(transition);
            const closestElements = this.getRelevantElement(payload);
            payload.data.elementTargets = closestElements;
        });

        const visitedStates: Set<string> = new Set();
        let traceActiveState: string = this.fsm.getStartState();
        let moActiveState: string = this.myOutputFSM.getStartState();
        do {
            if(visitedStates.has(traceActiveState)) {
                throw new Error(`Cycle detected with state ${traceActiveState}`);
            } else {
                visitedStates.add(traceActiveState);
            }
            const outgoingTransitions = this.fsm.getOutgoingTransitions(traceActiveState);
            if(outgoingTransitions.length === 0) {
                break;
            } else if(outgoingTransitions.length === 1) {
                const outgoingTransition = outgoingTransitions[0];
                const transitionPayload = this.fsm.getTransitionPayload(outgoingTransition);
                traceActiveState = this.fsm.getTransitionTo(outgoingTransition);

                const candidateOutgoingTransitions = this.myOutputFSM.getOutgoingTransitions(moActiveState);
                const candidatePayloads = candidateOutgoingTransitions.map((ot) => this.myOutputFSM.getTransitionPayload(ot) );
                const candidateIndex = this.getClosestTransitionMatch(outgoingTransition, transitionPayload, candidatePayloads);

                if (candidateIndex < 0) {
                    break;
                } else {
                    const selectedTransition = candidateOutgoingTransitions[candidateIndex];
                    moActiveState = this.myOutputFSM.getTransitionTo(selectedTransition);
                }
            } else {
                throw new Error(`More than 1 outgoing transition from state ${traceActiveState}`);
            }
        } while (true);
        this.myOutputFSM.setActiveState(moActiveState);
    };

    private getClosestTransitionMatch(targetName: string, targetPayload: ICTTTransitionData, candidatePayloads: ITraceTreeTransition[]): number {
        for(let i: number = 0; i<candidatePayloads.length; i++) {
            const candidatePayload = candidatePayloads[i];
            const { transitions } = candidatePayload;
            if (transitions.hasOwnProperty(this.clientID) && transitions[this.clientID] === targetName) {
                return i;
            }
        }
        return -1;
    };
    private getRelevantElement(payload: ITraceTreeTransition): Element[] {
        const { data } = payload;
        const { target } = data;
        if (target) {
            let parent: ISerializedParent | undefined = target.parent;
            const parents: ISerializedParent[] = parent ? [parent as ISerializedParent] : [];
            while (parent) {
                parent = parent.element.parent;
                if (parent) {
                    parents.unshift(parent);
                }
            }

            let currElement: Element | Document | null = document;
            let prevChildIndex: number;
            let prevTagIndex: number = 0;
            parents.forEach((p) => {
                const { element, childIndex, tagIndex } = p;
                const { attributes, textContent, tagName } = element;

                if (tagName.toUpperCase() === 'HTML') {
                    currElement = document.getElementsByTagName('html')[0];
                } else if (currElement && childIndex >= 0) {
                    const tagChildren = getImmediateChildren(currElement, tagName);
                    currElement = tagChildren[prevTagIndex];
                } else {
                    currElement = null;
                }

                prevChildIndex = childIndex;
                prevTagIndex = tagIndex;
            });

            if (currElement) {
                const { attributes, textContent, tagName } = target;
                const tagChildren = getImmediateChildren(currElement, tagName);
                currElement = tagChildren[prevTagIndex];
                if (currElement) {
                    return [currElement as any];
                } else {
                    return [];
                }
            } else {
                return [];
            }
        } else {
            return [];
        }
    }
}

function getImmediateChildren(el: Element | Document, tagName: string): Element[] {
    const childNodes = Array.prototype.filter.call(el.children, (c) => c.tagName === tagName);
    return childNodes;
}

function debounce(func: (...args: any[]) => any, wait: number, immediate: boolean = false) {
    let timeout: number;
    return (...args: any[]): void => {
        const later = () => {
            timeout = 0;
            if (!immediate) {
                func(...args);
            }
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait) as any;
        if (callNow) {
            func(...args);
        }
    };
}