import { isTracking, trackEffects, triggerEffects } from "./effect.js";
import { isArray, hasChanged } from "../shared/utils.js";
import { toRaw, isReactive, toReactive } from "./reactive.js";
import { createDep } from "./dep.js";

/**
 * @typedef {function(track: function(): void, trigger: function(): void): {get: function(): *, set: function(value: *): void}} CustomRefFactory
 */

/**
 *
 * @param {Reference|ComputedReference|CustomReference} ref
 */
export function trackRefValue(ref) {
    if (isTracking()) {
        ref = toRaw(ref);

        if (!ref.dep) {
            ref.dep = createDep();
        }

        trackEffects(ref.dep);
    }
}

/**
 *
 * @param {Reference|ComputedReference|CustomReference} ref
 */
export function triggerRefValue(ref) {
    ref = toRaw(ref);

    if (ref.dep) {
        triggerEffects(ref.dep);
    }
}


/**
 * Prüft ob der Wert eine Referenz ist
 *
 * @param {*} r - Der zu prüfende Wert
 * @returns {boolean} Ist der Wert eine Referenz
 */
export function isRef(r) {
    return Boolean(r && r.__isRef === true);
}

/**
 * Erzeugt eine Referenz auf einen Wert
 *
 * @param {*} value - Der Wert auf den die Referenz gesetzt werden soll
 * @returns {Reference} Die erzeugte Referenz
 */
export function ref(value) {
    return createRef(value);
}

/**
 * Erzeugt eine flache Referenz auf einen Wert
 *
 * @param {*} [value] - Der Wert auf den die Referenz gesetzt werden soll
 * @returns {Reference} Die erzeugte Referenz
 */
export function shallowRef(value) {
    return createRef(value, true);
}

/**
 * Erzeugt die Referenz
 *
 * @param {*} rawValue - Der Wert für die Referenz
 * @param {boolean} shallow - Erzeuge eine flache Referenz
 * @returns {Reference} Die erzeugte Referenz
 */
function createRef(rawValue, shallow = false) {
    if (isRef(rawValue)) {
        return rawValue;
    }

    return new Reference(rawValue, shallow);
}


class Reference {
    /**
     *
     * @param {*} rawValue
     * @param {boolean} shallow
     */
    constructor(rawValue, shallow) {
        /**
         *
         * @type {*}
         * @private
         */
        this.__isRef = true;

        /**
         * @type {boolean}
         * @private
         */
        this._shallow = shallow;

        /**
         *
         * @type {*}
         * @private
         */
        this._value = shallow ? rawValue : toReactive(rawValue);

        /**
         *
         * @type {*}
         * @private
         */
        this._rawValue = shallow ? rawValue : toRaw(rawValue);

        /**
         *
         * @type {Dep}
         */
        this.dep = undefined;
    }

    get value() {
        trackRefValue(this);

        return this._value;
    }

    set value(newVal) {
        newVal = this._shallow ? newVal : toRaw(newVal);

        if (hasChanged(newVal, this._rawValue)) {
            this._rawValue = newVal;
            this._value = this._shallow ? newVal : toReactive(newVal);
            triggerRefValue(this);
        }
    }
}

/**
 * Löst das Setzten eines Wertes einer Referenz aus
 *
 * @param {Reference} ref - Die Referenz
 */
export function triggerRef(ref) {
    triggerRefValue(ref);
}

/**
 * Gibt den Wert der Referenz zurück
 *
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
 *
 * @param {Object} objectWithRefs
 * @returns {Proxy}
 */
export function proxyRefs(objectWithRefs) {
    return isReactive(objectWithRefs)
        ? objectWithRefs
        : new Proxy(objectWithRefs, shallowUnwrapHandlers);
}

/**
 *
 */
class CustomReference {
    /**
     *
     * @param {CustomRefFactory} factory
     */
    constructor(factory) {
        const { get, set } = factory(
            () => trackRefValue(this),
            () => triggerRefValue(this)
        );

        this.__isRef = true;
        this._get = get;
        this._set = set;
    }

    get value() {
        return this._get();
    }

    set value(newVal) {
        this._set(newVal);
    }
}

/**
 *
 * @param {CustomRefFactory} factory
 * @returns
 */
export function customRef(factory) {
    return new CustomReference(factory);
}

/**
 * Erzeugt aus einem Objekt mit Werten eine Object mit Referenzen auf diese Werte
 *
 * @param {Object} object - Das Objekt
 * @returns {Object} Das Object mit den Referenzen
 */
export function toRefs(object) {
    const ret = isArray(object) ? new Array(object.length) : {};

    for (const key in object) {
        ret[key] = toRef(object, key);
    }

    return ret;
}

/**
 *
 */
class ObjectReference {
    /**
     *
     * @param {Object} object
     * @param {string} key
     */
    constructor(object, key) {
        this.__isRef = true;
        this._object = object;
        this._key = key;
    }

    get value() {
        return this._object[this._key];
    }

    set value(newVal) {
        this._object[this._key] = newVal;
    }
}

/**
 *
 * @param {Object} object
 * @param {string} key
 * @returns {Reference}
 */
export function toRef(object, key) {
    const val = object[key];

    return isRef(val) ? val : new ObjectReference(object, key);
}
