import { isObject, toRawType, def } from "../../shared/index.js";
import {
    mutableHandlers,
    readonlyHandlers,
    shallowReactiveHandlers,
    shallowReadonlyHandlers
} from "./baseHandlers.js";
import {
    mutableCollectionHandlers,
    readonlyCollectionHandlers,
    shallowCollectionHandlers,
    shallowReadonlyCollectionHandlers
} from "./collectionHandlers.js";

/**
 * Die Zielobjekte des Reaktiven Objekts.
 * @typedef {Object} Target
 * @property {boolean} [__skip]
 * @property {boolean} [__isReactive]
 * @property {boolean} [__isReadonly]
 * @property {*} [__raw]
 */

/**
 * Das Flag für reaktive Zielobjekte.
 * @typedef {string} ReactiveFlag
 */

/**
 * Die Flags für reaktive Zielobjekte.
 * @readonly
 * @enum {ReactiveFlag} ReactiveFlags
 */
export const ReactiveFlags = {
    SKIP: "__skip",
    IS_REACTIVE: "__isReactive",
    IS_READONLY: "__isReadonly",
    IS_SHALLOW: "__isShallow",
    RAW: "__raw"
};

export const reactiveMap = new WeakMap();
export const shallowReactiveMap = new WeakMap();
export const readonlyMap = new WeakMap();
export const shallowReadonlyMap = new WeakMap();

/**
 * Die Zieltypen
 * @readonly
 * @enum {number}
 */
const TargetType = {
    INVALID: 0,
    COMMON: 1,
    COLLECTION: 2
};

/**
 * Gibt den Typ des Ziels des reaktiven Objektes zurück.
 * @param {string} rawType - Der Typ des Ziels
 * @returns {number} Der reaktive Typ des Ziels
 */
function targetTypeMap(rawType) {
    switch (rawType) {
        case "Object":
        case "Array":
            return TargetType.COMMON;
        case "Map":
        case "Set":
        case "WeakMap":
        case "WeakSet":
            return TargetType.COLLECTION;
        default:
            return TargetType.INVALID;
    }
}

/**
 * Gibt den Typ des Ziels des reaktiven Objektes zurück.
 * @param {Target} value - Das Ziel
 * @returns {number} Der reaktive Typ des Ziels
 */
function getTargetType(value) {
    return value[ReactiveFlags.SKIP] || !Object.isExtensible(value)
        ? TargetType.INVALID
        : targetTypeMap(toRawType(value));
}

/**
 * Erzeugt ein reaktives Objekt aus dem übergebenen Objekt.
 * @param {Object} target - Das Objekt, welches reaktiv werden soll
 * @returns {Proxy|*} - Das reaktive Proxy-Objekt
 */
export function reactive(target) {
    if (isReadonly(target)) {
        return target;
    }

    return createReactiveObject(
        target,
        false,
        mutableHandlers,
        mutableCollectionHandlers,
        reactiveMap
    );
}

/**
 * Erzeugt ein flaches, reaktives Objekt aus dem übergebenen Objekt.
 * @param {Object} target - Das Objekt, welches reaktiv werden soll
 * @returns {Proxy} - Das reaktive Proxy-Objekt
 */
export function shallowReactive(target) {
    return createReactiveObject(
        target,
        false,
        shallowReactiveHandlers,
        shallowCollectionHandlers,
        shallowReactiveMap
    );
}

/**
 * Erzeugt ein schreibgeschütztes, reaktives Objekt aus dem übergebenen Objekt.
 * @template {Object} T
 * @param {T} target - Das Objekt, welches reaktiv werden soll
 * @returns {Proxy<T>} - Das reaktive Proxy-Objekt
 */
export function readonly(target) {
    return createReactiveObject(
        target,
        true,
        readonlyHandlers,
        readonlyCollectionHandlers,
        readonlyMap
    );
}

/**
 * Erzeugt ein flaches, schreibgeschütztes, reaktives Objekt aus dem übergebenen Objekt.
 * @param {Object} target - Das Objekt, welches reaktiv werden soll
 * @returns {Proxy} - Das reaktive Proxy-Objekt
 */
export function shallowReadonly(target) {
    return createReactiveObject(
        target,
        true,
        shallowReadonlyHandlers,
        shallowReadonlyCollectionHandlers,
        shallowReadonlyMap
    );
}

/**
 * Erzeugt das reaktive Objekt.
 * @param {Target} target - Das Objekt, welches reaktiv werden soll
 * @param {boolean} isReadonly - Es soll ein schreibgeschütztes, reaktives Objekt werden
 * @param {ProxyHandler<*>} baseHandlers - Die Handler des Proxy, wenn das Target keine Collection ist
 * @param {ProxyHandler<*>} collectionHandlers - Die Handler des Proxy, wenn das Target eine Collection ist
 * @param {WeakMap<Target,*>} proxyMap - Die Map der existierenden Reaktiven Objekte
 * @returns {Proxy|*} - Das reaktive Proxy-Objekt
 */
function createReactiveObject(
    target,
    isReadonly,
    baseHandlers,
    collectionHandlers,
    proxyMap
) {
    if (!isObject(target)) {
        return target;
    }

    if (target[ReactiveFlags.RAW] && !(isReadonly && target[ReactiveFlags.IS_REACTIVE])) {
        return target;
    }

    const existingProxy = proxyMap.get(target);

    if (existingProxy) {
        return existingProxy;
    }

    const targetType = getTargetType(target);

    if (targetType === TargetType.INVALID) {
        return target;
    }

    const proxy = new Proxy(
        target,
        targetType === TargetType.COLLECTION ? collectionHandlers : baseHandlers
    );

    proxyMap.set(target, proxy);

    return proxy;
}

/**
 * Prüft, ob der übergebene Wert ein reaktives Objekt ist.
 * @param {*} value - Der zu prüfende Wert
 * @returns {boolean} Ist es ein reaktives Objekt
 */
export function isReactive(value) {
    if (isReadonly(value)) {
        return isReactive(value[ReactiveFlags.RAW]);
    }

    return !!(value && value[ReactiveFlags.IS_REACTIVE]);
}

/**
 * Prüft, ob der übergebene Wert ein schreibgeschütztes, reaktives Objekt ist.
 * @param {*} value - Der zu prüfende Wert
 * @returns {boolean}  Ist es ein schreibgeschütztes, reaktives Objekt
 */
export function isReadonly(value) {
    return !!(value && value[ReactiveFlags.IS_READONLY]);
}

/**
 * Prüft, ob der übergebene Wert ein schreibgeschütztes, reaktives Objekt ist,
 * bei dem nur die erste Ebene schreibgeschützt ist.
 * @param {*} value - Der zu prüfende Wert
 * @returns {boolean} Ist es ein schreibgeschütztes, reaktives Objekt
 */
export function isShallow(value) {
    return !!(value && value[ReactiveFlags.IS_SHALLOW]);
}

/**
 * Prüft, ob der übergebene Wert ein reaktives Proxy-Objekt ist
 * @param {*} value - Der zu prüfende Wert
 * @returns {boolean} Ist es ein reaktives Objekt
 */
export function isProxy(value) {
    return isReactive(value) || isReadonly(value);
}

/**
 * Gibt den rohen Wert zurück, wenn der Wert nicht reaktiv ist, wird der Wert zurück gegeben.
 * @param {*} observed - Das reaktive Objekt
 * @returns {*} Das rohe Objekt
 */
export function toRaw(observed) {
    const raw = observed && observed[ReactiveFlags.RAW];

    return raw ? toRaw(raw) : observed;
}

/**
 * Markiert ein Objekt, sodass es niemals in einen Proxy konvertiert wird.
 * @template {Object} T
 * @param {T} value - Das reaktive Objekt
 * @returns {T} Gibt das Objekt selbst zurück
 */
export function markRaw(value) {
    def(value, ReactiveFlags.SKIP, true);

    return value;
}

/**
 * Gibt ein reaktives Objekt zurück, wenn der Wert kein Objekt ist, wird der Wert zurück gegeben.
 * @param {*} value - Der Wert
 * @returns {*} Das reaktive Objekt, falls der Wert ein Objekt ist, sonst der Wert selbst
 */
export const toReactive = (value) => isObject(value) ? reactive(value) : value;

/**
 * Gibt ein reaktives, readonly Objekt zurück, wenn der Wert kein Objekt ist, wird der Wert zurück gegeben.
 * @param {*} value - Der Wert
 * @returns {*} Das reaktive, readonly Objekt, falls der Wert ein Objekt ist, sonst der Wert selbst
 */
export const toReadonly = (value) => isObject(value) ? readonly(value) : value;
