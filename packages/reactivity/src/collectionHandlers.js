import { hasOwn, hasChanged, isMap } from "../../shared/index.js";
import { toRaw, toReactive, toReadonly, ReactiveFlags } from "./reactive.js";
import { track, trigger, ITERATE_KEY, MAP_KEY_ITERATE_KEY } from "./effect.js";
import { TrackOpTypes, TriggerOpTypes } from "./operations.js";

const toShallow = (value) => value;
const getProto = (v) => Reflect.getPrototypeOf(v);

/**
 * @typedef {Object} CollectionOperations
 */

/**
 * Gibt den Wert für den Schlüssel in der Collection zurück
 * @param {Map|WeakMap} target - Die Collection
 * @param {*} key - Der Schlüssel
 * @param {boolean} [isReadonly] - Ist die Collection readonly
 * @param {boolean} [isShallow] - Ist die Collection flach
 * @returns {*} Der Wert für den Schlüssel
 */
function get(target, key, isReadonly = false, isShallow = false) {
    target = target[ReactiveFlags.RAW];
    const rawTarget = toRaw(target);
    const rawKey = toRaw(key);

    if (!isReadonly) {
        if (key !== rawKey) {
            track(rawTarget, TrackOpTypes.GET, key);
        }

        track(rawTarget, TrackOpTypes.GET, rawKey);
    }

    const { has } = getProto(rawTarget);
    const wrap = isShallow ? toShallow : isReadonly ? toReadonly : toReactive;

    if (has.call(rawTarget, key)) {
        return wrap(target.get(key));
    } else if (has.call(rawTarget, rawKey)) {
        return wrap(target.get(rawKey));
    } else if (target !== rawTarget) {
        target.get(key);
    }
}

/**
 * Prüft, ob die Collection einen Eintrag mit diesem Schlüssel hat
 * @param {*} key - Der Schlüssel
 * @param {boolean} [isReadonly] - Ist die Collection readonly
 * @returns {boolean} Hat die Collection einen Eintrag
 */
function has(key, isReadonly = false) {
    const target = this[ReactiveFlags.RAW];
    const rawTarget = toRaw(target);
    const rawKey = toRaw(key);

    if (!isReadonly) {
        if (key !== rawKey) {
            track(rawTarget, TrackOpTypes.HAS, key);
        }

        track(rawTarget, TrackOpTypes.HAS, rawKey);
    }

    return key === rawKey
        ? target.has(key)
        : target.has(key) || target.has(rawKey);
}

/**
 * Gibt die Größe der Collection zurück
 * @param {Object} target - Die Collection
 * @param {boolean} [isReadonly] - Ist die Collection readonly
 * @returns {number} Die Größe der Collection
 */
function size(target, isReadonly = false) {
    target = target[ReactiveFlags.RAW];

    if (!isReadonly) {
        track(toRaw(target), TrackOpTypes.ITERATE, ITERATE_KEY);
    }

    return Reflect.get(target, "size", target);
}

/**
 * Fügt einen Wert der Collection hinzu
 * @param {*} value - Der Wert
 * @returns {Set|WeakSet} Die Collection
 */
function add(value) {
    value = toRaw(value);
    const target = toRaw(this);
    const proto = getProto(target);
    const hadKey = proto.has.call(target, value);

    if (!hadKey) {
        target.add(value);
        trigger(target, TriggerOpTypes.ADD, value, value);
    }

    return this;
}

/**
 * Setzt den Wert für den übergebenen Schlüssel in der Collection
 * @param {*} key - Der Schlüssel
 * @param {*} value - Der Wert
 * @returns {Map|WeakMap} Die Collection
 */
function set(key, value) {
    value = toRaw(value);
    const target = toRaw(this);
    const { has, get } = getProto(target);
    let hadKey = has.call(target, key);

    if (!hadKey) {
        key = toRaw(key);
        hadKey = has.call(target, key);
    }

    const oldValue = get.call(target, key);
    target.set(key, value);

    if (!hadKey) {
        trigger(target, TriggerOpTypes.ADD, key, value);
    } else if (hasChanged(value, oldValue)) {
        trigger(target, TriggerOpTypes.SET, key, value);
    }

    return this;
}

/**
 * Entfernt einen Eintrag aus der Collection
 * @param {*} key - Der Schlüssel
 * @returns {boolean} Wurde erfolgreich entfernt
 */
function deleteEntry(key) {
    const target = toRaw(this);
    const { has } = getProto(target);
    let hadKey = has.call(target, key);

    if (!hadKey) {
        key = toRaw(key);
        hadKey = has.call(target, key);
    }

    const result = target.delete(key);

    if (hadKey) {
        trigger(target, TriggerOpTypes.DELETE, key, undefined);
    }

    return result;
}

/**
 * Entfernt alle Einträge aus der Collection
 */
function clear() {
    const target = toRaw(this);
    const hadItems = target.size !== 0;
    const result = target.clear();

    if (hadItems) {
        trigger(target, TriggerOpTypes.CLEAR, undefined, undefined);
    }

    return result;
}

/**
 * Erzeugt eine Funktion, diese iteriert über die Einträge in der Collection.
 * @param {boolean} isReadonly - Ist die Collection schreibgeschützt
 * @param {boolean} isShallow - Ist die Collection flach
 * @returns {function(*, *): *} Die forEach-Funktion
 */
function createForEach(isReadonly, isShallow) {
    return function forEach(callback, thisArg) {
        const observed = this;
        const target = observed[ReactiveFlags.RAW];
        const rawTarget = toRaw(target);
        const wrap = isShallow ? toShallow : isReadonly ? toReadonly : toReactive;

        if (!isReadonly) {
            track(rawTarget, TrackOpTypes.ITERATE, ITERATE_KEY);
        }

        return target.forEach((value, key) => {
            return callback.call(thisArg, wrap(value), wrap(key), observed);
        });
    };
}

/**
 * Erzeugt eine Iterator-Funktion, für die jeweilige Methode einen Iterator zurück gibt.
 * @param {string|Symbol} method - Die Iterator-Methode
 * @param {boolean} isReadonly - Ist die Collection schreibgeschützt
 * @param {boolean} isShallow - Ist die Collection flach
 * @returns {function(...[*]): Iterator} Die Funktion um die Methode aufzurufen
 */
function createIterableMethod(method, isReadonly, isShallow) {
    return function (...args) {
        const target = this[ReactiveFlags.RAW];
        const rawTarget = toRaw(target);
        const targetIsMap = isMap(rawTarget);
        const isPair = method === "entries" || (method === Symbol.iterator && targetIsMap);
        const isKeyOnly = method === "keys" && targetIsMap;
        const innerIterator = target[method](...args);
        const wrap = isShallow ? toShallow : isReadonly ? toReadonly : toReactive;

        if (!isReadonly) {
            track(
                rawTarget,
                TrackOpTypes.ITERATE,
                isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY
            );
        }

        return {
            next() {
                const { value, done } = innerIterator.next();

                return done
                    ? { value, done }
                    : {
                        value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
                        done
                    };
            },
            [Symbol.iterator]() {
                return this;
            }
        };
    };
}

/**
 * Ändert keine Werte, gibt nur die Collection zurück.
 * @param {TriggerOpTypes} type
 * @returns {function(): (boolean|*)}
 */
function createReadonlyMethod(type) {
    return function () {
        return type === TriggerOpTypes.DELETE ? false : this;
    };
}

/**
 * Erzeugt die Proxy-Handler-Funktionen für die Collection Methoden.
 * @returns {CollectionOperations[]}
 */
function createCollectionOperations() {
    /**
     * Die Methoden für eine editierbare Collection.
     * @type {CollectionOperations}
     */
    const mutableOperations = {
        get(key) {
            return get(this, key);
        },
        get size() {
            return size(this);
        },
        has,
        add,
        set,
        delete: deleteEntry,
        clear,
        forEach: createForEach(false, false)
    };

    /**
     * Die Methoden für eine flache Collection.
     * @type {CollectionOperations}
     */
    const shallowOperations = {
        get(key) {
            return get(this, key, false, true);
        },
        get size() {
            return size(this);
        },
        has,
        add,
        set,
        delete: deleteEntry,
        clear,
        forEach: createForEach(false, true)
    };

    /**
     * Die Methoden für eine schreibgeschützte Collection.
     * @type {CollectionOperations}
     */
    const readonlyOperations = {
        get(key) {
            return get(this, key, true);
        },
        get size() {
            return size(this, true);
        },
        has(key) {
            return has.call(this, key, true);
        },
        add: createReadonlyMethod(TriggerOpTypes.ADD),
        set: createReadonlyMethod(TriggerOpTypes.SET),
        delete: createReadonlyMethod(TriggerOpTypes.DELETE),
        clear: createReadonlyMethod(TriggerOpTypes.CLEAR),
        forEach: createForEach(true, false)
    };

    /**
     * Die Methoden für eine flache, schreibgeschützte Collection.
     * @type {CollectionOperations}
     */
    const shallowReadonlyOperations = {
        get(key) {
            return get(this, key, true, true);
        },
        get size() {
            return size(this, true);
        },
        has(key) {
            return has.call(this, key, true);
        },
        add: createReadonlyMethod(TriggerOpTypes.ADD),
        set: createReadonlyMethod(TriggerOpTypes.SET),
        delete: createReadonlyMethod(TriggerOpTypes.DELETE),
        clear: createReadonlyMethod(TriggerOpTypes.CLEAR),
        forEach: createForEach(true, true)
    };

    const iteratorMethods = ["keys", "values", "entries", Symbol.iterator];

    iteratorMethods.forEach(method => {
        mutableOperations[method] = createIterableMethod(
            method,
            false,
            false
        );

        readonlyOperations[method] = createIterableMethod(
            method,
            true,
            false
        );

        shallowOperations[method] = createIterableMethod(
            method,
            false,
            true
        );

        shallowReadonlyOperations[method] = createIterableMethod(
            method,
            true,
            true
        );
    });

    return [
        mutableOperations,
        readonlyOperations,
        shallowOperations,
        shallowReadonlyOperations
    ];
}

const [
    mutableOperations,
    readonlyOperations,
    shallowOperations,
    shallowReadonlyOperations
] = createCollectionOperations();

/**
 * Erzeugt einen Getter für die Proxy-Collection-Methoden, um die eigentlichen Collection Methoden zu wrappen.
 * @param {boolean} isReadonly - Ist die Collection schreibgeschützt
 * @param {boolean} isShallow - Ist die Collection flach
 * @returns {Function} Die get-Funktion
 */
function createCollectionGetter(isReadonly, isShallow) {
    const operations = isShallow
        ? isReadonly
            ? shallowReadonlyOperations
            : shallowOperations
        : isReadonly
            ? readonlyOperations
            : mutableOperations;

    return (target, key, receiver) => {
        if (key === ReactiveFlags.IS_REACTIVE) {
            return !isReadonly;
        } else if (key === ReactiveFlags.IS_READONLY) {
            return isReadonly;
        } else if (key === ReactiveFlags.RAW) {
            return target;
        }

        return Reflect.get(
            hasOwn(operations, key) && key in target
                ? operations
                : target,
            key,
            receiver
        );
    };
}

/**
 * Die Proxy-Handler für eine editierbare Collection.
 * @type {{get: Function}}
 */
export const mutableCollectionHandlers = {
    get: createCollectionGetter(false, false)
};

/**
 * Die Proxy-Handler für eine flache Collection.
 * @type {{get: Function}}
 */
export const shallowCollectionHandlers = {
    get: createCollectionGetter(false, true)
};

/**
 * Die Proxy-Handler für eine schreibgeschützte Collection.
 * @type {{get: Function}}
 */
export const readonlyCollectionHandlers = {
    get: createCollectionGetter(true, false)
};

/**
 * Die Proxy-Handler für eine flache, schreibgeschützte Collection.
 * @type {{get: Function}}
 */
export const shallowReadonlyCollectionHandlers = {
    get: createCollectionGetter(true, true)
};
