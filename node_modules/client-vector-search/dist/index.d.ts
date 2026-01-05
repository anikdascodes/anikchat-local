type Vector = number[];
type Distance = number;
type NodeIndex = number;
type Layer = LayerNode[];
interface LayerNode {
    vector: Vector;
    connections: NodeIndex[];
    layerBelow: NodeIndex | null;
}
declare class ExperimentalHNSWIndex {
    private L;
    private mL;
    private efc;
    private index;
    constructor(L?: number, mL?: number, efc?: number);
    setIndex(index: Layer[]): void;
    insert(vec: Vector): void;
    search(query: Vector, ef?: number): [Distance, NodeIndex][];
    toJSON(): {
        L: number;
        mL: number;
        efc: number;
        index: Layer[];
    };
    static fromJSON(json: any): ExperimentalHNSWIndex;
    toBinary(): Uint8Array;
    static fromBinary(binary: Uint8Array): ExperimentalHNSWIndex;
}

interface Filter {
    [key: string]: any;
}

interface SearchResult {
    similarity: number;
    object: any;
}
type StorageOptions = 'indexedDB' | 'localStorage' | 'none';
/**
 * Interface for search options in the EmbeddingIndex class.
 * topK: The number of top similar items to return.
 * filter: An optional filter to apply to the objects before searching.
 * useStorage: A flag to indicate whether to use storage options like indexedDB or localStorage.
 */
interface SearchOptions {
    topK?: number;
    filter?: Filter;
    useStorage?: StorageOptions;
    storageOptions?: {
        indexedDBName: string;
        indexedDBObjectStoreName: string;
    };
}
declare const initializeModel: (model?: string) => Promise<void>;
declare const getEmbedding: (text: string, precision?: number, options?: {
    pooling: string;
    normalize: boolean;
}, model?: string) => Promise<number[]>;
declare class EmbeddingIndex {
    private objects;
    private keys;
    constructor(initialObjects?: Filter[]);
    private findVectorIndex;
    private validateAndAdd;
    add(obj: Filter): void;
    update(filter: Filter, vector: Filter): void;
    remove(filter: Filter): void;
    removeBatch(filters: Filter[]): void;
    get(filter: Filter): Filter | null;
    size(): number;
    clear(): void;
    search(queryEmbedding: number[], options?: SearchOptions): Promise<SearchResult[]>;
    printIndex(): void;
    saveIndex(storageType: string, options?: {
        DBName: string;
        objectStoreName: string;
    }): Promise<void>;
    saveToIndexedDB(DBname?: string, objectStoreName?: string): Promise<void>;
    loadAndSearchFromIndexedDB(DBname: string | undefined, objectStoreName: string | undefined, queryEmbedding: number[], topK: number, filter: {
        [key: string]: any;
    }): Promise<SearchResult[]>;
    deleteIndexedDB(DBname?: string): Promise<void>;
    deleteIndexedDBObjectStore(DBname?: string, objectStoreName?: string): Promise<void>;
    getAllObjectsFromIndexedDB(DBname?: string, objectStoreName?: string): Promise<any[]>;
}

export { EmbeddingIndex, ExperimentalHNSWIndex, SearchResult, getEmbedding, initializeModel };
