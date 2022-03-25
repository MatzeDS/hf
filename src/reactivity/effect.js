import { TriggerOpTypes } from "./operations.js";
import { assign, isArray, isMap, isIntegerKey } from "../shared/utils.js";
import { recordEffectScope } from "./effectScope.js";
import {
    createDep,
    finalizeDepMarkers,
    initDepMarkers,
    newTracked,
    wasTracked
} from "./dep.js";

/**
 * @typedef {function(...args: *[]): *} EffectScheduler
 */

/**
 * @typedef {function(): void} ReactiveEffectRunner
 * @property {ReactiveEffect} effect
 */

/**
 * @typedef {Object} ReactiveEffectOptions
 * @property {boolean} [lazy]
 * @property {EffectScheduler} [scheduler]
 * @property {EffectScope} [scope]
 * @property {function(): void} [onStop]
 * @property {boolean} [allowRecurse]
 */

/**
 *
 * @type {number}
 */
let effectTrackDepth = 0;

/**
 *
 * @type {number}
 */
export let trackOpBit = 1;

/**
 *
 * @type {number}
 */
const maxMarkerBits = 30;

/**
 *
 * @type {WeakMap<*,Map<*,Dep>>}
 */
const targetMap = new WeakMap();

/**
 *
 * @type {ReactiveEffect[]}
 */
const effectStack = [];

/**
 *
 * @type {ReactiveEffect|undefined}
 */
let activeEffect;

export const ITERATE_KEY = Symbol("");
export const MAP_KEY_ITERATE_KEY = Symbol("");

/**
 *
 */
export class ReactiveEffect {
    /**
     *
     * @param {function(): *} fn
     * @param {EffectScheduler|null} [scheduler]
     * @param {EffectScope|null} [scope]
     */
    constructor(fn, scheduler = null, scope) {
        /**
         * @type {boolean}
         */
        this.active = true;

        /**
         * @type {Dep[]}
         */
        this.deps = [];

        /**
         *
         * @type {boolean}
         */
        this.computed = undefined;

        /**
         *
         * @type {boolean}
         */
        this.allowRecurse = undefined;

        /**
         * @type {function(): void}
         */
        this.onStop = undefined;

        /**
         * @type {Function}
         */
        this.fn = fn;

        /**
         * @type {EffectScheduler}
         */
        this.scheduler = scheduler;

        recordEffectScope(this, scope);
    }

    /**
     *
     *
     */
    run() {
        if (!this.active) {
            return this.fn();
        }

        if (!effectStack.length || !effectStack.includes(this)) {
            try {
                effectStack.push((activeEffect = this));
                enableTracking();

                trackOpBit = 1 << ++effectTrackDepth;

                if (effectTrackDepth <= maxMarkerBits) {
                    initDepMarkers(this);
                } else {
                    cleanupEffect(this);
                }

                return this.fn();
            } finally {
                if (effectTrackDepth <= maxMarkerBits) {
                    finalizeDepMarkers(this);
                }

                trackOpBit = 1 << --effectTrackDepth;

                resetTracking();
                effectStack.pop();
                const n = effectStack.length;
                activeEffect = n > 0 ? effectStack[n - 1] : undefined;
            }
        }
    }

    /**
     *
     */
    stop() {
        if (this.active) {
            cleanupEffect(this);

            if (this.onStop) {
                this.onStop();
            }

            this.active = false;
        }
    }
}

/**
 *
 * @param {ReactiveEffect} effect
 */
function cleanupEffect(effect) {
    const { deps } = effect;

    if (deps.length) {
        for (let i = 0; i < deps.length; i++) {
            deps[i].delete(effect);
        }

        deps.length = 0;
    }
}

/**
 * Erzeugt die Effekt-Funktion für die übergebene Funktion, um diese zu überwachen
 *
 * @param {function(): *|ReactiveEffectRunner} fn - Die Funktion, welche überwacht werden soll
 * @param {ReactiveEffectOptions} [options] - Optionen für den Effekt
 * @returns {ReactiveEffectRunner} Die Effekt-Funktion
 */
export function effect(fn, options) {
    if (fn.effect) {
        fn = fn.effect.fn;
    }

    const _effect = new ReactiveEffect(fn);

    if (options) {
        assign(_effect, options);

        if (options.scope) {
            recordEffectScope(_effect, options.scope);
        }
    }

    if (!options || !options.lazy) {
        _effect.run();
    }

    const runner = _effect.run.bind(_effect);
    runner.effect = _effect;

    return runner;
}

/**
 * Stoppt den Effekt
 *
 * @param {ReactiveEffectRunner} runner - Der Effekt
 */
export function stop(runner) {
    runner.effect.stop();
}

/**
 * @type {boolean}
 */
let shouldTrack = true;

/**
 * @type {boolean[]}
 */
const trackStack = [];

/**
 * Pausiert die Verfolgung
 */
export function pauseTracking() {
    trackStack.push(shouldTrack);
    shouldTrack = false;
}

/**
 * Schaltet die Verfolgung an
 */
export function enableTracking() {
    trackStack.push(shouldTrack);
    shouldTrack = true;
}

/**
 * Setzt die Verfolgung zurück auf den letzten Stand
 */
export function resetTracking() {
    const last = trackStack.pop();
    shouldTrack = last === undefined ? true : last;
}

/**
 * Fügt das Ziel zu den verfolgten Werten es aktive Effekts hinzu.
 *
 * @param {Object} target - Ziel
 * @param {TrackOpType} type - Operation
 * @param {*} key - Der Schlüssel
 */
export function track(target, type, key) {
    if (!isTracking()) {
        return;
    }

    let depsMap = targetMap.get(target);

    if (!depsMap) {
        targetMap.set(target, (depsMap = new Map()));
    }

    let dep = depsMap.get(key);

    if (!dep) {
        depsMap.set(key, (dep = createDep()));
    }

    trackEffects(dep);
}

/**
 * Prüft ob aktuell getrackt wird.
 *
 * @returns {boolean}
 */
export function isTracking() {
    return shouldTrack && activeEffect !== undefined;
}

/**
 * Trackt die aktuelle Abhängigkeit, durch Hinzufügen zum aktiven Effekt.
 *
 * @param {Dep} dep
 */
export function trackEffects(dep) {
    let shouldTrack = false;

    if (effectTrackDepth <= maxMarkerBits) {
        if (!newTracked(dep)) {
            dep.n |= trackOpBit;
            shouldTrack = !wasTracked(dep);
        }
    } else {
        shouldTrack = !dep.has(activeEffect);
    }

    if (shouldTrack) {
        dep.add(activeEffect);
        activeEffect?.deps.push(dep);
    }
}

/**
 * Auslösen, wenn sich der Wert des Ziels ändert, um alle Abhängigkeiten neu zu berechnen
 *
 * @param {Object} target - Das Ziel-Objekt
 * @param {TriggerOpType} type - Die Operation, die der Auslöser ist
 * @param {*} [key] - Der Schlüssel
 * @param {*} [newValue] - Der neue Wert
 */
export function trigger(target, type, key, newValue) {
    const depsMap = targetMap.get(target);

    if (!depsMap) {
        return;
    }

    let deps = [];

    if (type === TriggerOpTypes.CLEAR) {
        deps = [...depsMap.values()];
    } else if (key === "length" && isArray(target)) {
        depsMap.forEach((dep, key) => {
            if (key === "length" || key >= newValue) {
                deps.push(dep);
            }
        });
    } else {
        if (key !== void 0) {
            deps.push(depsMap.get(key));
        }

        switch (type) {
            case TriggerOpTypes.ADD:
                if (!isArray(target)) {
                    deps.push(depsMap.get(ITERATE_KEY));

                    if (isMap(target)) {
                        deps.push(depsMap.get(MAP_KEY_ITERATE_KEY));
                    }
                } else if (isIntegerKey(key)) {
                    deps.push(depsMap.get("length"));
                }

                break;

            case TriggerOpTypes.DELETE:
                if (!isArray(target)) {
                    deps.push(depsMap.get(ITERATE_KEY));

                    if (isMap(target)) {
                        deps.push(depsMap.get(MAP_KEY_ITERATE_KEY));
                    }
                }

                break;

            case TriggerOpTypes.SET:
                if (isMap(target)) {
                    deps.push(depsMap.get(ITERATE_KEY));
                }

                break;
        }
    }

    if (deps.length === 1) {
        if (deps[0]) {
            triggerEffects(deps[0]);
        }
    } else {
        const effects = [];

        for (const dep of deps) {
            if (dep) {
                effects.push(...dep);
            }
        }

        triggerEffects(createDep(effects));
    }
}

/**
 *
 * @param {Dep} dep
 */
export function triggerEffects(dep) {
    for (const effect of isArray(dep) ? dep : [...dep]) {
        if (effect !== activeEffect || effect.allowRecurse) {
            if (effect.scheduler) {
                effect.scheduler();
            } else {
                effect.run();
            }
        }
    }
}
