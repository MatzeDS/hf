import {
    isObject,
    hasOwn,
    isSymbol,
    hasChanged,
    isArray,
    isIntegerKey,
    assign,
    makeMap
} from "../../shared/index.js";
import { TrackOpTypes, TriggerOpTypes } from "./operations.js";
import { isRef } from "./ref.js";
import {
    reactive,
    readonly,
    toRaw,
    ReactiveFlags,
    readonlyMap,
    reactiveMap,
    shallowReactiveMap,
    shallowReadonlyMap,
    isReadonly,
    isShallow
} from "./reactive.js";
import {
    track,
    trigger,
    resetTracking,
    pauseTracking,
    ITERATE_KEY
} from "./effect.js";

/**
 * @typedef {Record<string, function>} ArrayOperations
 */

const isNonTrackableKeys = makeMap(["__proto__", "__isRef"]);

const builtInSymbols = new Set(
    Object.getOwnPropertyNames(Symbol)
        .map(key => Symbol[key])
        .filter(isSymbol)
);

/**
 * Erzeugt die Proxy-Handler-Funktionen für Array-Methoden.
 * @return {ArrayOperations}
 */
function createArrayOperations() {
    const operations = {};

    // Funktionen bei denen auf reaktive Werte geachtet werden muss
    ["includes", "indexOf", "lastIndexOf"].forEach(key => {
        operations[key] = function (...args) {
            const arr = toRaw(this);

            for (let i = 0, l = this.length; i < l; i++) {
                track(arr, TrackOpTypes.GET, String(i));
            }

            const res = arr[key](...args);

            if (res === -1 || res === false) {
                return arr[key](...args.map(toRaw));
            } else {
                return res;
            }
        };
    });

    // Funktionen die zu Längenänderungen führen
    ["push", "pop", "shift", "unshift", "splice"].forEach(key => {
        operations[key] = function (...args) {
            pauseTracking();
            const res = toRaw(this)[key].apply(this, args);
            resetTracking();

            return res;
        };
    });

    return operations;
}

const arrayOperations = createArrayOperations();

/**
 * Erzeugt einen Getter-Handler für das reaktive Proxy-Objekt
 * @param {boolean} isReadonly - Ist das reaktive Objekt schreibgeschützt
 * @param {boolean} shallow - Ist das reaktive Objekt flach
 * @returns {Function} Die get-Funktion
 */
function createGetter(isReadonly = false, shallow = false) {
    return function get(target, key, receiver) {
        if (key === ReactiveFlags.IS_REACTIVE) {
            return !isReadonly;
        } else if (key === ReactiveFlags.IS_READONLY) {
            return isReadonly;
        } else if (key === ReactiveFlags.IS_SHALLOW) {
            return shallow;
        } else if (
            key === ReactiveFlags.RAW &&
            receiver === (
                isReadonly
                    ? shallow
                        ? shallowReadonlyMap
                        : readonlyMap
                    : shallow
                        ? shallowReactiveMap
                        : reactiveMap
            ).get(target)
        ) {
            return target;
        }

        const targetIsArray = isArray(target);

        if (!isReadonly && targetIsArray && hasOwn(arrayOperations, key)) {
            return Reflect.get(arrayOperations, key, receiver);
        }

        const res = Reflect.get(target, key, receiver);

        if (isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) {
            return res;
        }

        if (!isReadonly) {
            track(target, TrackOpTypes.GET, key);
        }

        if (shallow) {
            return res;
        }

        if (isRef(res)) {
            const shouldUnwrap = !targetIsArray || !isIntegerKey(key);

            return shouldUnwrap ? res.value : res;
        }

        if (isObject(res)) {
            return isReadonly ? readonly(res) : reactive(res);
        }

        return res;
    };
}

const get = createGetter();
const shallowGet = createGetter(false, true);
const readonlyGet = createGetter(true);
const shallowReadonlyGet = createGetter(true, true);

/**
 * Erzeugt einen Setter-Handler für das reaktive Proxy-Objekt
 * @param {boolean} shallow - Ist das reaktive Objekt flach
 * @returns {Function} Die set-Funktion
 */
function createSetter(shallow = false) {
    return function set(target, key, value, receiver) {
        let oldValue = target[key];

        if (isReadonly(oldValue) && isRef(oldValue) && !isRef(value)) {
            return false;
        }

        if (!shallow && !isReadonly(value)) {
            if (!isShallow(value)) {
                value = toRaw(value);
                oldValue = toRaw(oldValue);
            }

            if (!isArray(target) && isRef(oldValue) && !isRef(value)) {
                oldValue.value = value;

                return true;
            }
        }

        const hadKey = isArray(target) && isIntegerKey(key)
            ? Number(key) < target.length
            : hasOwn(target, key);
        const result = Reflect.set(target, key, value, receiver);

        if (target === toRaw(receiver)) {
            if (!hadKey) {
                trigger(target, TriggerOpTypes.ADD, key, value);
            } else if (hasChanged(value, oldValue)) {
                trigger(target, TriggerOpTypes.SET, key, value);
            }
        }

        return result;
    };
}

const set = createSetter();
const shallowSet = createSetter(true);

/**
 * Der DeleteProperty-Handler für das reaktive Proxy-Objekt
 * @param {Object} target - Das Zielobjekt
 * @param {PropertyKey} key - Der Property der entfernt werden muss
 * @returns {boolean} - Wurde das Property erfolgreich entfernt
 */
function deleteProperty(target, key) {
    const hadKey = hasOwn(target, key);
    const result = Reflect.deleteProperty(target, key);

    if (result && hadKey) {
        trigger(target, TriggerOpTypes.DELETE, key, undefined);
    }

    return result;
}

/**
 * Der Has-Handler für das reaktive Proxy-Objekt
 * @param {Object} target - Das Zielobjekt
 * @param {PropertyKey} key - Des gesuchten Property
 * @returns {boolean} - Hat das Objekt den gesuchten Property
 */
function has(target, key) {
    const result = Reflect.has(target, key);

    if (!isSymbol(key) || !builtInSymbols.has(key)) {
        track(target, TrackOpTypes.HAS, key);
    }

    return result;
}

/**
 * Der OwnKeys-Handler für das reaktive Proxy-Objekt
 * @param {Object} target - Das Zielobjekt
 * @returns {PropertyKey[]} Die Properties des Objektes
 */
function ownKeys(target) {
    track(target, TrackOpTypes.ITERATE, isArray(target) ? "length" : ITERATE_KEY);

    return Reflect.ownKeys(target);
}

/**
 * Die Proxy-Handler für ein editierbares, reaktives Objekt
 * @type {{set: Function, get: Function, has: Function, ownKeys: Function, deleteProperty: Function}}
 */
export const mutableHandlers = {
    get,
    set,
    deleteProperty,
    has,
    ownKeys
};

/**
 * Die Proxy-Handler für ein schreibgeschütztes, reaktives Objekt
 * @type {{set: Function, get: Function, deleteProperty: Function}}
 */
export const readonlyHandlers = {
    get: readonlyGet,
    set() {
        return true;
    },
    deleteProperty() {
        return true;
    }
};

/**
 * Die Proxy-Handler für ein editierbares, flaches, reaktives Objekt
 * @type {{set: Function, get: Function, has: Function, ownKeys: Function, deleteProperty: Function}}
 */
export const shallowReactiveHandlers = assign(
    {},
    mutableHandlers,
    {
        get: shallowGet,
        set: shallowSet
    }
);

/**
 * Die Proxy-Handler für ein schreibgeschütztes, flaches, reaktives Objekt
 * @type {{set: Function, get: Function, deleteProperty: Function}}
 */
export const shallowReadonlyHandlers = assign(
    {},
    readonlyHandlers,
    {
        get: shallowReadonlyGet
    }
);
