/* tslint:disable:prefer-for-of */
export type EqualityCheck<T> = (t1:T, t2:T)=>boolean;
export type Hash<T> = (t:T)=>string;

export class HashMap<K, V> {
    private map:Map<any, Array<[K,V]>> = new Map<any, Array<[K,V]>>();
    private size:number = 0;
    public constructor(
        private equals:EqualityCheck<K> = ((k1:K, k2:K) => k1 === k2),
        private hash:Hash<K> = ((k:K) => `${k}`)
    ) {

    };
    public set(key:K, value:V):this {
        const hash = this.hash(key);
        if(this.map.has(hash)) {
            let found:boolean = false;
            const kvPairs = this.map.get(hash) as Array<[K,V]>;
            for(let i = 0; i<kvPairs.length; i++) {
                if(this.equals(kvPairs[i][0], key)) {
                    found = true;
                    kvPairs[i][1] = value;
                    break;
                }
            }
            if(!found) {
                kvPairs.push([key, value]);
                this.size++;
            }
        } else {
            this.map.set(hash, [[key, value]]);
            this.size++;
        }
        return this;
    };
    public get(key:K): V | undefined {
        const hash = this.hash(key);
        if(this.map.has(hash)) {
            const kvPairs = this.map.get(hash) as Array<[K,V]>;
            for(let i = 0; i<kvPairs.length; i++) {
                if(this.equals(kvPairs[i][0], key)) {
                    return kvPairs[i][1];
                }
            }
        }
        return undefined;
    };
    public has(key:K):boolean {
        const hash = this.hash(key);
        if(this.map.has(hash)) {
            const kvPairs = this.map.get(hash) as Array<[K,V]>;
            for(let i = 0; i<kvPairs.length; i++) {
                if(this.equals(kvPairs[i][0], key)) {
                    return true;
                }
            }
        }
        return false;
    };
    public delete(key:K):this {
        const hash = this.hash(key);
        if(this.map.has(hash)) {
            const kvPairs = this.map.get(hash) as Array<[K,V]>;
            for(let i = 0; i<kvPairs.length; i++) {
                if(this.equals(kvPairs[i][0], key)) {
                    kvPairs.splice(i, 1);
                    if(kvPairs.length === 0) {
                        this.map.delete(kvPairs);
                    }
                    this.size--;
                    break;
                }
            }
        }
        return this;
    };
    public getSize():number {
        return this.size;
    };
    public clear():this {
        this.map.clear();
        this.size = 0;
        return this;
    };
};