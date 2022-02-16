import { ReactiveEffect } from "./effect.js";
import { isRef } from "./ref.js";
import { isReactive, ReactiveFlags } from "./reactive.js";
import {
    EMPTY_OBJ,
    hasChanged,
    isArray,
    isFunction,
    isMap,
    isObject,
    isSet,
    isPlainObject,
    NOOP
} from "../shared/utils.js";

const INITIAL_WATCHER_VALUE = {};

/**
 * @typedef {Object} WatchOptions
 * @property {boolean} [immediate] - Die Callback Funktion wird direkt aufgerufen
 * @property {boolean} [deep] - Bei reaktiven Objekten wird auch auf Änderungen in der Tiefe reagiert
 */

/**
 * @typedef {function(function(): void): void} InvalidateCallback
 */

/**
 * @typedef {function(onInvalidate: InvalidateCallback): void} WatchEffect
 */

/**
 * @typedef {Reference|ComputedReference|function(): *} WatchSource
 */

/**
 * Überwacht eine oder Methere Variablen,
 * bei jeder Veränderung wird die Callback Funktion ausgeführt
 *
 * @param {WatchSource} source - Die zu überwachenden Vaiablen
 * @param {function(value: *, oldValue: *, onInvalidate: InvalidateCallback): void} cb - Die Callback Funktion, welche bei Änderungen aufgerufen wird
 * @param {WatchOptions} [options] - Optionen für den Watcher
 * @returns {function(): void} Die Funkion beendet die Überwachung der Variablen
 */
export function watch(source, cb, options) {
    return doWatch(source, cb, options);
}

/**
 * Alle aufgerufenen Variablen in der Funktion werden Überwacht,
 * wenn sich eine Variable ändert wird die Funktion erneut aufgerufen
 *
 * @param {WatchEffect} effect - Der Inhalt dieser Funkion wird überwacht
 * @returns {function(): void} Die Funktion beendet die Überwachung
 */
export function watchEffect(effect) {
    return doWatch(effect);
}

/**
 * Die Funktion erzeugt die Überwachung der Source und das Aufrufen des Callback
 *
 * @param {WatchSource|WatchSource[]|WatchEffect} source - Die zu überwachenden Vaiablen
 * @param {function(value: *, oldValue: *, onInvalidate: InvalidateCallback): void} [cb] - Die Callback Funktion, welche bei Änderungen aufgerufen wird
 * @param {boolean} [immediate] - Die Callback Funktion wird direkt aufgerufen
 * @param {boolean} [deep] - Bei reaktiven Objekten wird auch auf Änderungen in der Tiefe reagiert
 * @returns {function(): void} Die Funkion beendet die Überwachung der Variablen
 */
function doWatch(source, cb, { immediate, deep } = EMPTY_OBJ) {
    let getter;
    let forceTrigger = false;
    let isMultiSource = false;

    if (isRef(source)) {
        getter = () => source.value;
        forceTrigger = source._shallow;
    } else if (isReactive(source)) {
        getter = () => source;
        deep = true;
    } else if (isArray(source)) {
        isMultiSource = true;
        forceTrigger = source.some(isReactive);

        getter = () =>
            source.map(s => {
                if (isRef(s)) {
                    return s.value;
                } else if (isReactive(s)) {
                    return traverse(s);
                } else if (isFunction(s)) {
                    return s();
                }
            });
    } else if (isFunction(source)) {
        if (cb) {
            getter = () => source();
        } else {
            getter = () => {
                if (cleanup) {
                    cleanup();
                }

                return source(onInvalidate);
            };
        }
    } else {
        getter = NOOP;
    }

    if (cb && deep) {
        const baseGetter = getter;
        getter = () => traverse(baseGetter());
    }

    let cleanup;

    const onInvalidate = fn => {
        cleanup = effect.onStop = () => fn();
    };

    let oldValue = isMultiSource ? [] : INITIAL_WATCHER_VALUE;

    const job = () => {
        if (!effect.active) {
            return;
        }

        if (cb) {
            const newValue = effect.run();

            if (deep ||
                forceTrigger ||
                (isMultiSource
                    ? newValue.some((v, i) => hasChanged(v, oldValue[i]))
                    : hasChanged(newValue, oldValue))
            ) {
                if (cleanup) {
                    cleanup();
                }

                cb(newValue, oldValue === INITIAL_WATCHER_VALUE ? undefined : oldValue, onInvalidate);
                oldValue = newValue;
            }
        } else {
            effect.run();
        }
    };

    job.allowRecurse = !!cb;

    const effect = new ReactiveEffect(getter, job);

    if (cb) {
        if (immediate) {
            job();
        } else {
            oldValue = effect.run();
        }
    } else {
        effect.run();
    }

    return () => {
        effect.stop();
    };
}

/**
 * Durchläuft alle Source-Daten um die Variablen aufzurufen,
 * damit auf Änderungen dieser reagiert werden kann.
 *
 * @param {*} value - Source, deren Inhalt aufgerufen wird
 * @param {Set} [seen] - Um zu verhindern, dass man in eine Schleife kommt, werden alle durchsuchten Sourcen gespeichert
 * @returns {*} Die Source selbst wird zurück gegeben
 */
function traverse(value, seen) {
    if (!isObject(value) || value[ReactiveFlags.SKIP]) {
        return value;
    }

    seen = seen || new Set();

    if (seen.has(value)) {
        return value;
    }

    seen.add(value);

    if (isRef(value)) {
        traverse(value.value, seen);
    } else if (isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            traverse(value[i], seen);
        }
    } else if (isSet(value) || isMap(value)) {
        value.forEach(v => {
            traverse(v, seen);
        });
    } else if (isPlainObject(value)) {
        for (const key in value) {
            traverse(value[key], seen);
        }
    }

    return value;
}
