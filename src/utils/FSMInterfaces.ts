export interface ISerializedElement {
    tagName: string;
    textContent: string | null;
    attributes: { [name: string]: string };
    parent?: { element: ISerializedElement, childIndex: number }
};

// tslint:disable: no-empty-interface
export interface ICTTStateData { };

export interface ICTTTransitionData {
    eventType: string;
    textContent: string | null;
    target: ISerializedElement;
    manualLabel?: string;
};

export interface ITraceTreeState {
    states: { [userID: string]: string };
}
export interface ITraceTreeTransition {
    transitions: { [userID: string]: string };
    data: ICTTTransitionData;
}