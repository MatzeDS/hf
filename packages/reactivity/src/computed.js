import { isFunction, NOOP } from "../../shared/index.js";
import { ReactiveEffect } from "./effect.js";
import { ReactiveFlags, toRaw } from "./reactive.js";
import { trackRefValue, triggerRefValue } from "./ref.js";

/**
 * Die berechnete Referenz
 * @class
 * @implements {BaseReference}
 */
class ComputedReference {
    /**
     * Die Abhängigkeiten der Referenz.
     * @type {Dep}
     */
    dep;
    /**
     * Der Wert der Referenz.
     * @type {*}
     * @private
     */
    #value;
    /**
     * Die Set-Methode der Referenz.
     * @type {function(*): void}
     * @private
     */
    #setter;
    /**
     * Flag zur Kennzeichnung, ob der Wert der Referenz sich verändert hat.
     * @type {boolean}
     * @private
     */
    #dirty = true;
    /**
     * Der Effekt, der bei der Berechnung aktiv ist.
     * @type {ReactiveEffect}
     * @private
     */
    #effect;
    /**
     * Ist die Referenz schreibgeschützt?
     * @type {boolean}
     * @private
     */
    #isReadonly = false;

    /**
     * Ist die Referenz schreibgeschützt?
     * @return {boolean}
     */
    get [ReactiveFlags.IS_READONLY]() {
        return this.#isReadonly;
    }

    /**
     * Zur Identifizierung als Referenz.
     * @return {boolean}
     */
    get __isRef() {
        return true;
    }

    /**
     * Der Effekt der Referenz.
     * @return {ReactiveEffect}
     */
    get effect() {
        return this.#effect;
    }

    /**
     * Der Konstruktor der berechnenden Referenz.
     * @template ComputedValue
     * @param {function(): ComputedValue} getter - Die Get-Funktion für den Value
     * @param {function(value: *): void} setter - Die Set-Funktion für den Value
     * @param {boolean} isReadonly - ist die berechnete Referenz schreibgeschützt
     */
    constructor(getter, setter, isReadonly) {
        this.#setter = setter;

        this.#effect = new ReactiveEffect(getter, () => {
            if (!this.#dirty) {
                this.#dirty = true;
                triggerRefValue(this);
            }
        });

        this.#effect.computed = this;
        this.#effect.active = true;
        this.#isReadonly = isReadonly;
    }

    /**
     * Gibt den berechneten Wert, auf den die Referenz verweist, zurück.
     * @returns {ComputedValue} Der Wert
     */
    get value() {
        const self = toRaw(this);
        trackRefValue(self);

        if (self.#dirty) {
            self.#dirty = false;
            self.#value = self.effect.run();
        }

        return self.#value;
    }

    /**
     * Setzt den Wert, um den neuen Wert der Referenz zu berechnen.
     * @param {*} newValue - Der neue Wert
     */
    set value(newValue) {
        this.#setter(newValue);
    }
}

/**
 * Um eine Funktion reaktiv zu machen, damit bei Änderungen von Variablen der Wert neu berechnet wird.
 * @param {function(): *|{ get: function(): *, set: function(value: *): void }} getterOrOptions - Die Funktion, die reaktiv berechnet werden soll
 * @returns {ComputedReference} Referenz auf das Resultat der Funktion
 */
export function computed(getterOrOptions) {
    let getter;
    let setter;

    const onlyGetter = isFunction(getterOrOptions);

    if (onlyGetter) {
        getter = getterOrOptions;
        setter = NOOP;
    } else {
        getter = getterOrOptions.get;
        setter = getterOrOptions.set;
    }

    return new ComputedReference(
        getter,
        setter,
        onlyGetter || !setter
    );
}
