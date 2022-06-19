import { isArray, hasChanged } from "../../shared/index.js";
import { toRaw, isReactive, toReactive } from "./reactive.js";
import { createDep } from "./dep.js";
import {
    activeEffect,
    shouldTrack,
    trackEffects,
    triggerEffects
} from "./effect.js";

/**
 * Die Factory-Funktion soll eine set- und get-Funktion für den Value der Referenz liefern.
 * @typedef {function(track: function(): void, trigger: function(): void): {get: function(): *, set: function(value: *): void}} CustomRefFactory
 */

/**
 * Die Basis Referenz.
 * @typedef {Object} BaseReference
 * @property {Dep} dep - Die Abhängigkeiten der Referenz, die bei Änderung informiert werden müssen
 * @property {*} value - Der Wert der Referenz
 */

/**
 * Um Abhängigkeit des Effekts zurück zu verfolgen zu können,
 * wird in der Referenz die Abhängigkeit zum Effekt festgehalten.
 * @param {BaseReference} ref - Die Referenz
 */
export function trackRefValue(ref) {
    if (shouldTrack && activeEffect) {
        ref = toRaw(ref);
        trackEffects(ref.dep || (ref.dep = createDep()));
    }
}

/**
 * Teilt allen Abhängigkeiten der Referenz mit, dass sich etwas verändert hat.
 * @param {BaseReference} ref - Die Referenz
 */
export function triggerRefValue(ref) {
    ref = toRaw(ref);

    if (ref.dep) {
        triggerEffects(ref.dep);
    }
}


/**
 * Prüft, ob der Wert eine Referenz ist.
 * @param {*} r - Der zu prüfende Wert
 * @returns {boolean} Ist der Wert eine Referenz
 */
export function isRef(r) {
    return Boolean(r && r.__isRef === true);
}

/**
 * Erzeugt eine Referenz auf einen Wert.
 * @param {*} [value] - Der Wert, auf den die Referenz gesetzt werden soll
 * @returns {Reference} Die erzeugte Referenz
 */
export function ref(value) {
    return createRef(value, false);
}

/**
 * Erzeugt eine flache Referenz auf einen Wert.
 * @template T
 * @param {T} [value] - Der Wert, auf den die Referenz gesetzt werden soll
 * @returns {Reference<T>} Die erzeugte Referenz
 */
export function shallowRef(value) {
    return createRef(value, true);
}

/**
 * Erzeugt die Referenz.
 * @param {*} rawValue - Der Wert für die Referenz
 * @param {boolean} shallow - Erzeuge eine flache Referenz
 * @returns {Reference} Die erzeugte Referenz
 */
function createRef(rawValue, shallow) {
    if (isRef(rawValue)) {
        return rawValue;
    }

    return new Reference(rawValue, shallow);
}

/**
 * Die normale Referenz.
 * @class
 * @implements {BaseReference}
 */
class Reference {
    /**
     * Ist es eine flache Referenz?
     * @type {boolean}
     * @private
     */
    #isShallow;
    /**
     * Der reaktive Wert der Referenz.
     * @type {*}
     * @private
     */
    #value;
    /**
     * Der rohe (nicht reaktive) Wert.
     * @type {*}
     * @private
     */
    #rawValue;
    /**
     * Die Abhängigkeiten der Referenz.
     * @type {Dep}
     */
    dep;

    /**
     * Zur Identifizierung als Referenz.
     * @return {boolean}
     */
    get __isRef() {
        return true;
    }

    /**
     * Ist es eine flache Referenz?
     * @return {boolean}
     */
    get __isShallow() {
        return this.#isShallow;
    }

    /**
     * Der Konstruktor der Referenz.
     * @param {*} rawValue
     * @param {boolean} isShallow
     */
    constructor(rawValue, isShallow) {
        this.#isShallow = isShallow;
        this.#value = isShallow ? rawValue : toReactive(rawValue);
        this.#rawValue = isShallow ? rawValue : toRaw(rawValue);
    }

    /**
     * Gibt den Wert, auf den die Referenz verweist, zurück.
     * @returns {*} Der Wert
     */
    get value() {
        trackRefValue(this);

        return this.#value;
    }

    /**
     * Setzt den Wert, auf den die Referenz zeigt.
     * @param {*} newVal - Der neue Wert
     */
    set value(newVal) {
        newVal = this.#isShallow ? newVal : toRaw(newVal);

        if (hasChanged(newVal, this.#rawValue)) {
            this.#rawValue = newVal;
            this.#value = this.#isShallow ? newVal : toReactive(newVal);
            triggerRefValue(this);
        }
    }
}

/**
 * Löst die Änderung der Referenz aus.
 * @param {Reference} ref - Die Referenz
 */
export function triggerRef(ref) {
    triggerRefValue(ref);
}

/**
 * Gibt den Wert der Referenz zurück.
 * @param {Reference} ref - Die Referenz
 * @returns {*} Der Wert der Referenz
 */
export function unref(ref) {
    return isRef(ref) ? ref.value : ref;
}

/**
 * @type {ProxyHandler<*>}
 */
const shallowUnwrapHandlers = {
    get: (target, key, receiver) => unref(Reflect.get(target, key, receiver)),
    set: (target, key, value, receiver) => {
        const oldValue = target[key];

        if (isRef(oldValue) && !isRef(value)) {
            oldValue.value = value;

            return true;
        } else {
            return Reflect.set(target, key, value, receiver);
        }
    }
};

/**
 * Erzeugt aus mehreren Referenzen in einem Objekt ein reaktives Objekt.
 * @param {Object} objectWithRefs - Ein Objekt mit Referenzen
 * @returns {Proxy} Das reaktive Objekt
 */
export function proxyRefs(objectWithRefs) {
    return isReactive(objectWithRefs)
        ? objectWithRefs
        : new Proxy(objectWithRefs, shallowUnwrapHandlers);
}

/**
 * Einer benutzerdefinierte Referenz.
 * @class
 * @implements {BaseReference}
 */
class CustomReference {
    /**
     * Die Getter-Funktion für den Value.
     * @type {function(): *}
     */
    #get;
    /**
     * Die Setter-Funktion für den Value.
     * @type {function(value: *): void}
     */
    #set;
    /**
     * Die Abhängigkeiten der Referenz.
     * @type {Dep}
     */
    dep;

    /**
     * Zur Identifizierung als Referenz.
     * @return {boolean}
     */
    get __isRef() {
        return true;
    }

    /**
     * Konstruktor für die benutzerdefinierte Referenz.
     * @param {CustomRefFactory} factory
     */
    constructor(factory) {
        const { get, set } = factory(
            () => trackRefValue(this),
            () => triggerRefValue(this)
        );

        this.#get = get;
        this.#set = set;
    }

    /**
     * Gibt den Wert der Referenz zurück.
     * @return {*}
     */
    get value() {
        return this.#get();
    }

    /**
     * Setzt den Wert der Referenz.
     * @param {*} newVal - Der neue Wert
     */
    set value(newVal) {
        this.#set(newVal);
    }
}

/**
 * Erzeugt eine benutzerdefinierte Referenz, mit Hilfe einer Factory-Funktion.
 * @param {CustomRefFactory} factory - Die Factory-Funktion
 * @returns {CustomReference}
 */
export function customRef(factory) {
    return new CustomReference(factory);
}

/**
 * Erzeugt aus einem Objekt mit Werten eine Object mit Referenzen auf diese Werte.
 * @param {Object|Array} object - Das Objekt
 * @returns {Record<string, Reference>|Reference[]} Das Object mit den Referenzen
 */
export function toRefs(object) {
    const ret = isArray(object) ? new Array(object.length) : {};

    for (const key in object) {
        ret[key] = toRef(object, key);
    }

    return ret;
}

/**
 * Eine Referenz auf einen Wert in einem Objekt.
 * @class
 * @implements {BaseReference}
 */
class ObjectReference {
    /**
     * Das Objekt, in dem sich der Wert befindet.
     * @type {Object}
     */
    #object;
    /**
     * Der Schlüssel auf den Eintrag im Objekt.
     * @type {string}
     */
    #key;
    /**
     * Der Default-Wert der Referenz.
     * @type {*}
     */
    #defaultValue;

    /**
     * Zur Identifizierung als Referenz.
     * @return {boolean}
     */
    get __isRef() {
        return true;
    }

    /**
     * Der Konstruktor der Objekt Referenz.
     * @param {Object} object - Das Objekt
     * @param {string} key - Der Schlüssel
     * @param {*} [defaultValue] - Der Default-Wert
     */
    constructor(object, key, defaultValue) {
        this.#object = object;
        this.#key = key;
        this.#defaultValue = defaultValue;
    }

    /**
     * Gibt den Wert der Referenz zurück.
     * @return {*} Der Wert
     */
    get value() {
        const val = this.#object[this.#key];

        return val === undefined ? this.#defaultValue : val;
    }

    /**
     * Setzt den Wert, auf den die Referenz im Objekt zeigt.
     * @param {*} newVal - Der neue Wert
     */
    set value(newVal) {
        this.#object[this.#key] = newVal;
    }
}

/**
 * Erzeugt eine Referenz auf ein Wert aus einem Objekt mit dem übergebenen Schlüssel.
 * @param {Object} object - Das Objekt in dem sich der Wert befindet
 * @param {string} key - Der Schlüssel auf den Wert
 * @param {*} [defaultValue] - Der default Wert, falls kein Eintrag für den Schlüssel existiert
 * @returns {Reference} Die erzeugte Referenz
 */
export function toRef(object, key, defaultValue) {
    const val = object[key];

    return isRef(val) ? val : new ObjectReference(object, key, defaultValue);
}
