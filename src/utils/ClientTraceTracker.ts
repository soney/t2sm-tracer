import { SDBClient, SDBDoc } from 'sdb-ts';
import { FSM } from 't2sm';
import { SDBBinding } from 't2sm/built/bindings/sharedb_binding';

export interface ICTTStateData {
    data?: any
};
export interface ICTTTransitionData {
    eventType: string;
    target: ISerializedElement;
    manualLabel?: string;
};

export interface ISerializedElement {
    tagName: string;
    attributes: { [name: string]: string };
    parent?: { element: ISerializedElement, childIndex: number }
};

export class ClientTraceTracker {
    private static serializeElement(el: HTMLElement): ISerializedElement {
        const { tagName, parentElement } = el;
        const attributes = { };
        for(let i: number = 0; i < el.attributes.length; i++) {
            const { name, value } = el.attributes.item(i) as Attr;
            attributes[name] = value;
        }
        if (parentElement) {
            const childIndex = Array.prototype.indexOf.call(parentElement.childNodes, el);
            const sParent = ClientTraceTracker.serializeElement(parentElement);
            return { tagName, attributes, parent: { element: sParent, childIndex } };
        } else {
            return { tagName, attributes };
        }
    }

    private fsm: FSM<ICTTStateData, ICTTTransitionData> = new FSM<ICTTStateData, ICTTTransitionData>();
    private ws: WebSocket;
    private sdbClient: SDBClient;
    private sdbDoc: SDBDoc<any>;
    private sdbBinding: SDBBinding;
    private currentState: string;

    public constructor(serverURL: string, clientID: string) {
        this.initialize(serverURL, clientID);
    }

    public addEvent(eventType: string, target: HTMLElement, manualLabel?: string): void {
        const sTarget = ClientTraceTracker.serializeElement(target);
        const payload: ICTTTransitionData = { eventType, manualLabel, target: sTarget };

        const previousState = this.currentState;
        this.currentState = this.fsm.addState({});
        this.fsm.addTransition(previousState, this.currentState, undefined, payload);
    }

    private async initialize(serverURL: string, clientID: string): Promise<void> {
        this.ws = new WebSocket(serverURL);
        this.sdbClient = new SDBClient(this.ws);
        this.sdbDoc = this.sdbClient.get('t2sm', 'userTraces');
        await this.sdbDoc.fetch();
        this.sdbBinding = new SDBBinding(this.sdbDoc, [clientID], this.fsm);

        this.currentState = this.fsm.addState({});
        this.fsm.addTransition(this.fsm.getStartState(), this.currentState);
    }
}