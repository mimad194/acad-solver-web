import type { Firestore } from "firebase-admin/firestore";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * Loads the REAL @google-cloud/firestore Serializer used internally by firebase-admin
 * with `ignoreUndefinedProperties: false` so any `undefined` anywhere in a document
 * immediately throws the exact same Firestore validation error seen in production.
 */
function createRealFirestoreValidator(): (data: unknown) => void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Serializer } = require("@google-cloud/firestore/build/src/serializer");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { validateDocumentData } = require("@google-cloud/firestore/build/src/write-batch");
    const serializer = new Serializer({
      _settings: { ignoreUndefinedProperties: false },
    });
    return (data: unknown) => {
      validateDocumentData("data", data, false);
      serializer.encodeFields(data);
    };
  } catch {
    return (data: unknown) => assertNoUndefinedDeep(data, "");
  }
}

export function assertNoUndefinedDeep(value: unknown, fieldPath: string): void {
  if (value === undefined) {
    throw new Error(
      `Value for argument "data" is not a valid Firestore document. Cannot use "undefined" as a Firestore value (found in field "${fieldPath || "root"}"). If you want to ignore undefined values, enable \`ignoreUndefinedProperties\`.`
    );
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertNoUndefinedDeep(value[i], `${fieldPath}[${i}]`);
    }
    return;
  }
  if (typeof value === "object" && value !== null) {
    const proto = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null) {
      for (const [k, v] of Object.entries(value)) {
        assertNoUndefinedDeep(v, fieldPath ? `${fieldPath}.${k}` : k);
      }
    }
  }
}

type DocRecord = Record<string, unknown>;

interface WhereClause {
  field: string;
  op: "==";
  value: unknown;
}

interface OrderByClause {
  field: string;
  dir: "asc" | "desc";
}

function cloneData<T>(data: T): T {
  return structuredClone(data);
}

/**
 * Strict in-memory Firestore harness that mirrors firebase-admin's Firestore API:
 * - Enforces strict Firestore document validation via @google-cloud/firestore's real
 *   Serializer & validateDocumentData with `ignoreUndefinedProperties: false`
 * - Supports collection().doc().get()/set()/delete()
 * - Supports where("==", ...), orderBy(..., "asc"|"desc"), limit(n)
 * - Supports serialized runTransaction() with rollback on error
 */
export class StrictInMemoryFirestore {
  private collections = new Map<string, Map<string, DocRecord>>();
  private txChain: Promise<void> = Promise.resolve();
  private validateDoc = createRealFirestoreValidator();
  public writeLog: Array<{ collection: string; id: string; data: DocRecord }> = [];

  private getColMap(name: string): Map<string, DocRecord> {
    let col = this.collections.get(name);
    if (!col) {
      col = new Map<string, DocRecord>();
      this.collections.set(name, col);
    }
    return col;
  }

  private validateAndStore(collectionName: string, docId: string, data: unknown): void {
    if (!docId || typeof docId !== "string" || docId.includes("/")) {
      throw new Error(`Invalid Firestore document ID: "${docId}"`);
    }
    assertNoUndefinedDeep(data, "");
    this.validateDoc(data);
    const cloned = cloneData(data as DocRecord);
    this.getColMap(collectionName).set(docId, cloned);
    this.writeLog.push({ collection: collectionName, id: docId, data: cloned });
  }

  public clear(): void {
    this.collections.clear();
    this.writeLog = [];
  }

  public getRawDocument(collectionName: string, docId: string): DocRecord | undefined {
    const d = this.collections.get(collectionName)?.get(docId);
    return d ? cloneData(d) : undefined;
  }

  public collection(collectionName: string) {
    return this.buildQuery(collectionName, [], [], undefined);
  }

  private buildDocRef(collectionName: string, docId: string) {
    const self = this;
    return {
      __collection: collectionName,
      __id: docId,
      id: docId,
      async get() {
        const val = self.getColMap(collectionName).get(docId);
        return {
          id: docId,
          exists: val !== undefined,
          data: () => (val !== undefined ? cloneData(val) : undefined),
        };
      },
      async set(data: unknown) {
        self.validateAndStore(collectionName, docId, data);
      },
      async delete() {
        self.getColMap(collectionName).delete(docId);
      },
    };
  }

  private buildQuery(
    collectionName: string,
    wheres: WhereClause[],
    orders: OrderByClause[],
    limitCount?: number
  ) {
    const self = this;
    return {
      doc(docId: string) {
        return self.buildDocRef(collectionName, docId);
      },
      where(field: string, op: "==", value: unknown) {
        if (op !== "==") {
          throw new Error(`StrictInMemoryFirestore only supports "==" operator, got "${op}"`);
        }
        return self.buildQuery(
          collectionName,
          [...wheres, { field, op, value }],
          orders,
          limitCount
        );
      },
      orderBy(field: string, dir: "asc" | "desc" = "asc") {
        return self.buildQuery(
          collectionName,
          wheres,
          [...orders, { field, dir }],
          limitCount
        );
      },
      limit(n: number) {
        return self.buildQuery(collectionName, wheres, orders, n);
      },
      async get() {
        const col = self.getColMap(collectionName);
        let entries = Array.from(col.entries()).map(([id, data]) => ({
          id,
          data: cloneData(data),
        }));

        for (const w of wheres) {
          entries = entries.filter((e) => e.data[w.field] === w.value);
        }

        if (orders.length > 0) {
          entries.sort((a, b) => {
            for (const o of orders) {
              const av = String(a.data[o.field] ?? "");
              const bv = String(b.data[o.field] ?? "");
              if (av !== bv) {
                const cmp = av < bv ? -1 : 1;
                return o.dir === "desc" ? -cmp : cmp;
              }
            }
            return 0;
          });
        }

        if (typeof limitCount === "number") {
          entries = entries.slice(0, limitCount);
        }

        const docs = entries.map((e) => ({
          id: e.id,
          exists: true,
          data: () => cloneData(e.data),
        }));

        return {
          empty: docs.length === 0,
          size: docs.length,
          docs,
        };
      },
    };
  }

  public async runTransaction<T>(
    updateFn: (tx: {
      get: (ref: { __collection: string; __id: string }) => Promise<{
        id: string;
        exists: boolean;
        data: () => DocRecord | undefined;
      }>;
      set: (ref: { __collection: string; __id: string }, data: unknown) => void;
      delete: (ref: { __collection: string; __id: string }) => void;
    }) => Promise<T>
  ): Promise<T> {
    const prev = this.txChain;
    let release!: () => void;
    this.txChain = new Promise<void>((res) => {
      release = res;
    });
    await prev;

    const pendingWrites: Array<
      | { type: "set"; collection: string; id: string; data: unknown }
      | { type: "delete"; collection: string; id: string }
    > = [];

    try {
      const tx = {
        get: async (ref: { __collection: string; __id: string }) => {
          const val = this.getColMap(ref.__collection).get(ref.__id);
          return {
            id: ref.__id,
            exists: val !== undefined,
            data: () => (val !== undefined ? cloneData(val) : undefined),
          };
        },
        set: (ref: { __collection: string; __id: string }, data: unknown) => {
          // Validate immediately (just like Firestore SDK)
          assertNoUndefinedDeep(data, "");
          this.validateDoc(data);
          pendingWrites.push({
            type: "set",
            collection: ref.__collection,
            id: ref.__id,
            data: cloneData(data),
          });
        },
        delete: (ref: { __collection: string; __id: string }) => {
          pendingWrites.push({
            type: "delete",
            collection: ref.__collection,
            id: ref.__id,
          });
        },
      };

      const result = await updateFn(tx);

      // Commit atomically only if callback succeeded
      for (const w of pendingWrites) {
        if (w.type === "set") {
          this.validateAndStore(w.collection, w.id, w.data);
        } else {
          this.getColMap(w.collection).delete(w.id);
        }
      }
      return result;
    } finally {
      release();
    }
  }

  public asFirestore(): Firestore {
    return this as unknown as Firestore;
  }
}
