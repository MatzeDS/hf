import { ReactiveEffect } from "./effect.js";
import { isFunction, NOOP } from "../shared/utils.js";
import { ReactiveFlags, toRaw } from "./reactive.js";
import { trackRefValue, triggerRefValue } from "./ref.js";

/**
 * Berechnete Referenz
 */
class ComputedReference {
    /**
     *
     * @param {function(): *} getter - Getter Funktion
     * @param {function(value: *): void} setter - Setter Funktion
     * @param {boolean} isReadonly - ist die Computed Reference nur lesend
     */
    constructor(getter, setter, isReadonly) {
        /**
         *
         * @type {Dep}
         */
        this.dep = undefined;

        /**
         *
         * @type {*}
         * @private
         */
        this._value = undefined;

        /**
         *
         * @type {function(*): void}
         * @private
         */
        this._setter = setter;

        /**
         *
         * @type {boolean}
         * @private
         */
        this._dirty = true;

        /**
         *
         * @type {boolean}
         * @private
         */
        this.__isRef = true;

        /**
         *
         * @type {ReactiveEffect}
         */
        this.effect = new ReactiveEffect(getter, () => {
            if (!this._dirty) {
                this._dirty = true;
                triggerRefValue(this);
            }
        });

        this.effect.computed = this;
        this.effect.active = true;
        /**
         *
         * @type {boolean}
         */
        this[ReactiveFlags.IS_READONLY] = isReadonly;
    }

    get value() {
        const self = toRaw(this);
        trackRefValue(self);

        if (self._dirty) {
            self._dirty = false;
            self._value = self.effect.run();
        }

        return self._value;
    }

    set value(newValue) {
        this._setter(newValue);
    }
}

/**
 * Um eine Funktion reaktiv zu machen, damit bei Änderungen von Variablen der Wert neu berechnet wird.
 *
 * @param {function(): *|{ get: function(): *, set: function(value: *): void }} getterOrOptions - Die Funktion die reaktiv berechnet werden soll
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
