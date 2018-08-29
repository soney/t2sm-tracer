import { SDBClient, SDBDoc } from 'sdb-ts';
import { FSM } from 't2sm';
import { SDBBinding } from 't2sm/built/bindings/sharedb_binding';

export interface ICTTStateData {
    data?: any
};
export interface ICTTTransitionData {
    eventType: string;
    textContent: string | null;
    target: ISerializedElement;
    manualLabel?: string;
};

export interface ISerializedElement {
    tagName: string;
    textContent: string | null;
    attributes: { [name: string]: string };
    parent?: { element: ISerializedElement, childIndex: number }
};

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
    private outputFSM: FSM<any, any>;
    private ws: WebSocket;
    private sdbClient: SDBClient;
    private traceDoc: SDBDoc<any>;
    private traceFSMBinding: SDBBinding;
    private outputDoc: SDBDoc<any>;
    private outputFSMBinding: SDBBinding;
    private currentState: string;


    public constructor(serverURL: string, clientID: string) {
        this.ready = this.initialize(serverURL, clientID);
    }

    public addEvent(eventType: string, target: HTMLElement, manualLabel?: string): void {
        const textContent = target.textContent;
        const sTarget = ClientTraceTracker.serializeElement(target);
        const payload: ICTTTransitionData = { eventType, manualLabel, textContent, target: sTarget };

        const previousState = this.currentState;
        this.currentState = this.fsm.addState({});
        this.fsm.addTransition(previousState, this.currentState, undefined, payload);
    }

    public destroy() {
        this.traceFSMBinding.destroy();
    }

    public getOutputFSM(): FSM<any, any> {
        return this.outputFSM;
    }

    private async initialize(serverURL: string, clientID: string): Promise<void> {
        this.ws = new WebSocket(serverURL);
        this.sdbClient = new SDBClient(this.ws);
        this.traceDoc = this.sdbClient.get('t2sm', 'userTraces');
        await this.traceDoc.fetch();
        this.traceFSMBinding = new SDBBinding(this.traceDoc, [clientID], this.fsm);

        this.currentState = this.fsm.addState({});
        this.fsm.addTransition(this.fsm.getStartState(), this.currentState, undefined, { eventType: '(start)', target: null, textContent: null});

        this.outputDoc = this.sdbClient.get('t2sm', 'generatedFSMs');
        await this.outputDoc.fetch();
        this.outputFSMBinding = new SDBBinding(this.outputDoc, ['outputFSM']);
        this.outputFSM = this.outputFSMBinding.getFSM();
    }
}