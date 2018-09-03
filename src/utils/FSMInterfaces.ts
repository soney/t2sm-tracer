export interface ISerializedElement {
    tagName: string;
    textContent: string | null;
    attributes: { [name: string]: string };
    parent?: ISerializedParent;
};

export interface ISerializedParent {
    element: ISerializedElement;
    childIndex: number;
    tagIndex: number;
}

// tslint:disable: no-empty-interface
export interface ICTTStateData { };

export interface ICTTTransitionData {
    eventType: string;
    elementTargets?: Element[];
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