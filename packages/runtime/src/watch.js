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
} from "../../shared/index.js";
import {
    isRef,
    isReactive,
    isShallow,
    ReactiveFlags,
    ReactiveEffect
} from "../../reactivity/index.js";
import {
    queuePreFlushCallback,
    queuePostFlushCallback
} from "./scheduler.js";
import {
    currentInstance
} from "./WebComponent.js";

const INITIAL_WATCHER_VALUE = {};

/**
 * @typedef {Object} WatchOptions
 * @property {boolean} [immediate] - Die Callback-Funktion wird direkt aufgerufen
 * @property {boolean} [deep] - Bei reaktiven Objekten wird auch auf Änderungen in der Tiefe reagiert
 * @property {"pre"|"post"|"sync"} [flush] - Bestimmt, wann auf die Änderungen reagiert werden soll
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
 * Überwacht eine oder mehrere Variablen,
 * bei jeder Veränderung wird die Callback-Funktion ausgeführt
 * @param {WatchSource} source - Die zu überwachenden Variablen
 * @param {function(value: *, oldValue: *, onInvalidate: InvalidateCallback): void} cb - Die Callback-Funktion, welche bei Änderungen aufgerufen wird
 * @param {WatchOptions} [options] - Optionen für den Watcher
 * @returns {function(): void} Die Funktion beendet die Überwachung der Variablen
 */
export function watch(source, cb, options) {
    return doWatch(source, cb, options);
}

/**
 * Alle aufgerufenen Variablen in der Funktion werden überwacht,
 * wenn sich eine Variable ändert wird die Funktion erneut aufgerufen
 * @param {WatchEffect} effect - Der Inhalt dieser Funktion wird überwacht
 * @param {WatchOptions} [options] - Die Optionen für den Watcher
 * @returns {function(): void} Die Funktion beendet die Überwachung
 */
export function watchEffect(effect, options) {
    return doWatch(effect, null, options);
}

/**
 * Die Funktion erzeugt die Überwachung der Source und das Aufrufen des Callback
 * @param {WatchSource|WatchSource[]|WatchEffect} source - Die zu überwachenden Variablen
 * @param {function(value: *, oldValue: *, onInvalidate: InvalidateCallback): void} [cb] - Die Callback-Funktion, welche bei Änderungen aufgerufen wird
 * @param {WatchOptions} [options] - Die Optionen für den Watcher
 * @returns {function(): void} Die Funktion beendet die Überwachung der Variablen
 */
function doWatch(source, cb, options = EMPTY_OBJ) {
    const { immediate, flush } = options;
    let deep = options.deep;
    const instance = currentInstance;
    let getter;
    let forceTrigger = false;
    let isMultiSource = false;

    if (isRef(source)) {
        getter = () => source.value;
        forceTrigger = isShallow(source);
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
                if (instance && instance.isUnmounted) {
                    return;
                }

                if (cleanup) {
                    cleanup();
                }

                return source(onCleanup);
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

    const onCleanup = fn => {
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

                cb(newValue, oldValue === INITIAL_WATCHER_VALUE ? undefined : oldValue, onCleanup);
                oldValue = newValue;
            }
        } else {
            effect.run();
        }
    };

    job.allowRecurse = !!cb;

    let scheduler;

    if (flush === "sync") {
        scheduler = job;
    } else if (flush === "post") {
        scheduler = () => queuePostFlushCallback(job);
    } else {
        scheduler = () => {
            if (!instance || instance.isMounted) {
                queuePreFlushCallback(job);
            } else {
                job();
            }
        };
    }

    const effect = new ReactiveEffect(getter, scheduler);

    if (cb) {
        if (immediate) {
            job();
        } else {
            oldValue = effect.run();
        }
    } else if (flush === "post") {
        queuePostFlushCallback(effect.run.bind(effect));
    } else {
        effect.run();
    }

    return () => {
        effect.stop();

        if (instance && instance.removeScopeEffect) {
            instance.removeScopeEffect(effect);
        }
    };
}

/**
 * Durchläuft alle Source-Daten, um die Variablen aufzurufen,
 * damit auf Änderungen dieser reagiert werden kann.
 * @param {*} value - Source, deren Inhalt aufgerufen wird
 * @param {Set} [seen] - Um zu verhindern, dass man in eine Schleife kommt, werden alle durchsuchten Sourcen gespeichert
 * @returns {*} Die Source selbst wird zurückgegeben
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
