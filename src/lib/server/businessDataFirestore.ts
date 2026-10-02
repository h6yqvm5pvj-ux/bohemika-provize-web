import { FieldPath, Filter, type Firestore } from "firebase-admin/firestore";
import {
  BUSINESS_PRIVATE_FIELDS, BUSINESS_LOOKUP_FIELDS, businessCollection,
  businessEncryptionRequired, businessLookupField, businessLookupToken,
  isBusinessInternalField, lazyBusinessRecord, sealBusinessRecord,
} from "./businessDataEncryption";

// This facade changes storage representation only. Domain authorization stays
// in the existing guards. It must be installed on every server SDK entry point;
// migrations deliberately use the raw SDK and inspect the stored ciphertext.
// Unlike a Firestore converter it also covers update(), batches, transactions,
// selected fields and equality queries. No private value is decrypted until a
// caller requests data()/get(field) from its snapshot.
type Sdk = Record<string, any>;
type Kind = "db" | "query" | "ref" | "snapshot" | "querySnapshot" | "writer" | "aggregate";
const adapters = new WeakMap<object, Firestore>();
const migrationDatabases = new WeakMap<Firestore, Firestore>();

/** Offline migration only: inspect physical ciphertext, never use in an API. */
export const rawBusinessMigrationDatabase = (db: Firestore): Firestore => migrationDatabases.get(db) ?? db;

export function withBusinessDataEncryption(database: Firestore): Firestore {
  const existing = adapters.get(database);
  if (existing) return existing;
  const rawValues = new WeakMap<object, Sdk>();
  const wrappers = new WeakMap<object, Sdk>();
  const queryScopes = new WeakMap<object, string | undefined>();
  const raw = (value: any): any => value && typeof value === "object" ? rawValues.get(value) ?? value : value;
  const fieldName = (value: unknown): string => {
    if (typeof value === "string") return value;
    // The SDK keeps documentId as a FieldPath. Other FieldPaths must not bypass
    // the private-field check via an alternative representation.
    if (value instanceof FieldPath && value.isEqual(FieldPath.documentId())) return "__name__";
    if (value instanceof FieldPath) {
      for (const fields of Object.values(BUSINESS_PRIVATE_FIELDS)) {
        for (const field of fields) if (value.isEqual(new FieldPath(field))) return field;
      }
    }
    throw new Error("Use a string field path for business-data operations");
  };
  const protectedField = (scope: string | undefined, field: string) =>
    (BUSINESS_PRIVATE_FIELDS[scope ?? ""] ?? []).some(name => field === name || field.startsWith(`${name}.`));

  function where(target: Sdk, scope: string | undefined, args: any[]) {
    if (!BUSINESS_PRIVATE_FIELDS[scope ?? ""]) return target.where(...args);
    if (args.length !== 3) throw new Error("Use explicit field filters for business-data queries");
    const [inputField, operation, value] = args;
    const field = fieldName(inputField);
    if (isBusinessInternalField(field)) throw new Error("Private indexes are internal");
    if (!protectedField(scope, field)) return target.where(...args);
    if (!BUSINESS_LOOKUP_FIELDS[scope!]?.includes(field)) throw new Error("This private field has no equality index");
    if (!["==", "in", "array-contains", "array-contains-any"].includes(operation)) throw new Error("Private fields support equality queries only");
    const tokenize = (item: unknown) => item === null ? null : businessLookupToken(`${scope}:${field}`, item);
    const token = operation === "in" || operation === "array-contains-any"
      ? (Array.isArray(value) ? value.map(tokenize) : (() => { throw new Error("Invalid equality query"); })())
      : tokenize(value);
    const indexed = Filter.where(businessLookupField(field), operation, token);
    // During rollout a single Firestore OR query preserves ordering, limits,
    // cursors and readTime across mixed encrypted/legacy documents.
    return target.where(businessEncryptionRequired() ? indexed : Filter.or(indexed, Filter.where(inputField, operation, value)));
  }

  function prepareWrite(ref: Sdk, method: string, args: any[]): any[] {
    const collection = businessCollection(ref.path);
    if (!collection) return args;
    if (method === "update" && (typeof args[0] !== "object" || args[0] instanceof FieldPath || Array.isArray(args[0]))) {
      // Normalize the supported SDK field/value overload without losing its
      // final precondition. Nested private updates are rejected by the codec.
      const entries: [string, unknown][] = [];
      let index = 0;
      while (index + 1 < args.length && (typeof args[index] === "string" || args[index] instanceof FieldPath)) {
        entries.push([fieldName(args[index]), args[index + 1]]); index += 2;
      }
      if (!entries.length || args.length - index > 1) throw new Error("Invalid private document update");
      return prepareWrite(ref, method, [Object.fromEntries(entries), ...args.slice(index)]);
    }
    const source = args[0];
    if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("Invalid business-data write");
    const sealed = sealBusinessRecord(ref.path, source);
    if (method !== "set") return [sealed, ...args.slice(1)];
    const options = args[1];
    if (!options?.merge && !options?.mergeFields) return [sealed, ...args.slice(1)];

    // merge:true recursively merges maps. For an encrypted field that would
    // retain old plaintext keys underneath its new envelope. An explicit field
    // mask replaces each encrypted map atomically and preserves other merging.
    const mask: (string | FieldPath)[] = [];
    const visit = (value: unknown, parts: string[]) => {
      const field = parts[0];
      const map = value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
      if (parts.length === 1 && (protectedField(collection, field) || isBusinessInternalField(field))) mask.push(new FieldPath(...parts));
      else if (map && Object.keys(value as Sdk).length) for (const [key, nested] of Object.entries(value as Sdk)) visit(nested, [...parts, key]);
      else mask.push(new FieldPath(...parts));
    };
    if (options.mergeFields) {
      for (const input of options.mergeFields) {
        const field = fieldName(input);
        if (protectedField(collection, field) && !BUSINESS_PRIVATE_FIELDS[collection].includes(field)) throw new Error("Replace the complete private field");
        mask.push(input);
        if (BUSINESS_LOOKUP_FIELDS[collection]?.includes(field)) mask.push(businessLookupField(field));
      }
    } else for (const [key, value] of Object.entries(sealed)) visit(value, [key]);
    return [sealed, { mergeFields: mask }];
  }

  const wrapRef = (value: Sdk) => wrap(value, "ref", value.parent?.id);
  const wrapSnapshot = (value: Sdk, scope?: string) => value && typeof value.data === "function" ? wrap(value, "snapshot") : wrap(value, "querySnapshot", scope);

  function wrap(target: Sdk, kind: Kind, scope?: string): Sdk {
    if (!target) return target;
    const cached = wrappers.get(target);
    if (cached) return cached;
    const proxy = new Proxy(target, {
      get(object, property) {
        // Never expose internal SDK handles that let callers bypass the codec.
        if (typeof property === "string" && property.startsWith("_")) throw new Error("Firestore internals are not part of the business-data API");
        if (property === "firestore") return result;
        if (property === "ref") return wrapRef(object.ref);
        if (property === "parent") return object.parent ? wrap(object.parent, "query", object.parent.id) : null;
        if (kind === "querySnapshot") {
          if (property === "docs") return object.docs.map((doc: Sdk) => wrapSnapshot(doc));
          if (property === "query") return wrap(object.query, "query", scope);
          if (property === "forEach") return (fn: (doc: Sdk) => void, thisArg?: unknown) => object.forEach((doc: Sdk) => fn.call(thisArg, wrapSnapshot(doc)));
          if (property === "docChanges") return (...args: any[]) => object.docChanges(...args).map((change: Sdk) => ({ ...change, doc: wrapSnapshot(change.doc) }));
        }
        if (kind === "snapshot") {
          if (property === "data") return () => {
            const data = object.data();
            return data === undefined ? undefined : lazyBusinessRecord(object.ref.path, data);
          };
          if (property === "get") return (field: string | FieldPath) => {
            const name = fieldName(field);
            if (isBusinessInternalField(name)) return undefined;
            if (!protectedField(businessCollection(object.ref.path) ?? undefined, name)) return object.get(field);
            const data = lazyBusinessRecord(object.ref.path, object.data() ?? {});
            return name.split(".").reduce<any>((value, key) => value?.[key], data);
          };
        }
        const value = Reflect.get(object, property, object);
        if (typeof value !== "function") return value;
        if (property === "collection") return (path: string) => {
          const collection = object.collection(path);
          return wrap(collection, "query", collection.id);
        };
        if (property === "collectionGroup") return (name: string) => wrap(object.collectionGroup(name), "query", name);
        if (property === "doc") return (...args: any[]) => wrapRef(object.doc(...args));
        if (property === "batch") return () => wrap(object.batch(), "writer");
        if (property === "runTransaction") return (fn: (tx: any) => Promise<any>, options?: unknown) => object.runTransaction((tx: Sdk) => fn(wrap(tx, "writer")), options);
        if (property === "getAll") return async (...args: any[]) => (await object.getAll(...args.map(raw))).map((doc: Sdk) => wrapSnapshot(doc));
        if (property === "get" && kind === "writer") return async (...args: any[]) => wrapSnapshot(await object.get(...args.map(raw)), args[0] && queryScopes.get(raw(args[0])));
        if (property === "get" && (kind === "ref" || kind === "query")) return async (...args: any[]) => wrapSnapshot(await object.get(...args), scope);
        if (property === "where") return (...args: any[]) => wrap(where(object, scope, args), "query", scope);
        if (property === "orderBy") return (field: any, ...args: any[]) => {
          if (BUSINESS_PRIVATE_FIELDS[scope ?? ""] && protectedField(scope, fieldName(field))) throw new Error("Private fields cannot be sorted by ciphertext");
          return wrap(object.orderBy(field, ...args), "query", scope);
        };
        if (property === "select") return (...fields: any[]) => {
          if (BUSINESS_PRIVATE_FIELDS[scope ?? ""]) for (const field of fields) {
            const name = fieldName(field);
            if (isBusinessInternalField(name) || (protectedField(scope, name) && !BUSINESS_PRIVATE_FIELDS[scope!].includes(name))) throw new Error("Select a complete private field");
          }
          return wrap(object.select(...fields), "query", scope);
        };
        if (["limit", "limitToLast", "offset", "startAt", "startAfter", "endAt", "endBefore"].includes(String(property))) return (...args: any[]) => wrap(value.apply(object, args.map(raw)), "query", scope);
        if (property === "count") return () => wrap(object.count(), "aggregate", scope);
        if (property === "onSnapshot") return (...args: any[]) => {
          const index = args.findIndex(arg => typeof arg === "function");
          if (index < 0) throw new Error("Use callback-style Firestore listeners");
          const fn = args[index]; args[index] = (snapshot: Sdk) => fn(wrapSnapshot(snapshot, scope));
          return object.onSnapshot(...args);
        };
        if (property === "listDocuments" || property === "listCollections") return async (...args: any[]) => (await value.apply(object, args)).map((item: Sdk) => property === "listDocuments" ? wrapRef(item) : wrap(item, "query", item.id));
        if (property === "add") return async (data: Sdk) => {
          const ref = object.doc(); await ref.create(...prepareWrite(ref, "create", [data])); return wrapRef(ref);
        };
        if (["set", "create", "update"].includes(String(property))) return (...args: any[]) => {
          if (kind === "writer") {
            const ref = raw(args[0]);
            value.call(object, ref, ...prepareWrite(ref, String(property), args.slice(1)));
            return proxy;
          }
          return value.apply(object, prepareWrite(object, String(property), args));
        };
        if (property === "delete" && kind === "writer") return (...args: any[]) => { value.apply(object, args.map(raw)); return proxy; };
        if (["withConverter", "bulkWriter", "recursiveDelete", "stream", "aggregate", "getPartitions", "findNearest"].includes(String(property))) return () => { throw new Error("Unsupported operation on encrypted business storage"); };
        return (...args: any[]) => value.apply(object, args.map(raw));
      },
    });
    rawValues.set(proxy, target); wrappers.set(target, proxy);
    if (kind === "query") queryScopes.set(target, scope);
    return proxy;
  }
  const result = wrap(database as unknown as Sdk, "db") as Firestore;
  adapters.set(database, result); adapters.set(result, result);
  migrationDatabases.set(result, database);
  return result;
}
