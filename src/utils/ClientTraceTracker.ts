import { SDBClient, SDBDoc } from 'sdb-ts';
import { FSM } from 't2sm';
import { SDBBinding } from 't2sm/built/bindings/sharedb_binding';
import { cloneIntoFSM } from './cloneIntoFSM';
import { ICTTStateData, ICTTTransitionData, ISerializedElement, ITraceTreeState, ITraceTreeTransition } from './FSMInterfaces';


export class ClientTraceTracker {
    private static serializeElement(el: HTMLElement): ISerializedElement {
        const { tagName, parentElement, textContent } = el;
        const attributes = { };
        for(let i: number = 0; i < el.attributes.length; i++) {
            const { name, value } = el.attributes.item(i) as Attr;
            attributes[name] = value;
        }
        if (parentElement) {
            const childIndex = Array.prototype.indexOf.call(parentElement.childNodes, el);
            const sParent = ClientTraceTracker.serializeElement(parentElement);
            return { tagName, attributes, textContent, parent: { element: sParent, childIndex } };
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
        this.outputFSM.on('stateAdded', this.updateMyOutputFSM);
        this.outputFSM.on('stateRemoved', this.updateMyOutputFSM);
        this.outputFSM.on('transitionAdded', this.updateMyOutputFSM);
        this.outputFSM.on('transitionRemoved', this.updateMyOutputFSM);
        this.outputFSM.on('transitionRenamed', this.updateMyOutputFSM);
        this.outputFSM.on('statePayloadChanged', this.updateMyOutputFSM);
        this.outputFSM.on('transitionAliasChanged', this.updateMyOutputFSM);
        this.outputFSM.on('transitionPayloadChanged', this.updateMyOutputFSM);
        this.outputFSM.on('transitionToStateChanged', this.updateMyOutputFSM);
        this.outputFSM.on('transitionFromStateChanged', this.updateMyOutputFSM);
    }

    private updateMyOutputFSM = (): void => {
        cloneIntoFSM(this.outputFSM, this.myOutputFSM);
        this.myOutputFSM.setActiveState(this.myOutputFSM.getStartState());

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
                    this.myOutputFSM.fireTransition(selectedTransition);
                    moActiveState = this.myOutputFSM.getActiveState();
                }
            } else {
                throw new Error(`More than 1 outgoing transition from state ${traceActiveState}`);
            }
        } while (true);
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
}