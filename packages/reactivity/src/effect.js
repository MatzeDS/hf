import { assign, isArray, isMap, isIntegerKey } from "../../shared/index.js";
import { TriggerOpTypes } from "./operations.js";
import { recordEffectScope } from "./effectScope.js";
import {
    createDep,
    finalizeDepMarkers,
    initDepMarkers,
    newTracked,
    wasTracked
} from "./dep.js";

/**
 * Zeitplaner für den Effekt.
 * @typedef {function(...args: *[]): *} EffectScheduler
 */

/**
 * Funktion zum Auslösen des Effekts.
 * @typedef {function(): void} ReactiveEffectRunner
 * @property {ReactiveEffect} effect - Der Effekt
 */

/**
 * Die Optionen für den Effekt.
 * @typedef {Object} ReactiveEffectOptions
 * @property {boolean} [lazy] - Wenn nicht Wahr, wird der Effekt direkt ausgelöst
 * @property {EffectScheduler} [scheduler] - Der Zeitplaner für den Effekt
 * @property {EffectScope} [scope] - Der Effekt-Bereich für den Effekt
 * @property {function(): void} [onStop] - Die Callback-Funktion, wenn der Effekt beendet wird
 * @property {boolean} [allowRecurse] - Erlaubt rekursive Aufrufe des Effekts
 */

/**
 * Die aktuelle Verfolgungstiefe.
 * @type {number}
 */
let effectTrackDepth = 0;

/**
 * Das aktuelle Bit für die Verfolgungstiefe.
 * @type {number}
 */
export let trackOpBit = 1;

/**
 * Die maximale Tiefe für die Nachverfolgung von Abhängigkeiten.
 * @type {number}
 */
const maxMarkerBits = 30;

/**
 * Eine Map mit Abhängigkeiten.
 * @type {WeakMap<*,Map<*,Dep>>}
 */
const targetMap = new WeakMap();

/**
 * Der aktive Effekt.
 * @type {ReactiveEffect|undefined}
 */
export let activeEffect;

export const ITERATE_KEY = Symbol("");
export const MAP_KEY_ITERATE_KEY = Symbol("");


/**
 * Der reaktive Effekt führt die Funktion aus. Dabei werden sich alle Abhängigkeiten gemerkt,
 * sodass bei einer Änderung einer dieser Abhängigkeiten die Funktion erneut aufgerufen werden kann.
 * @class
 */
export class ReactiveEffect {
    /**
     * Ist der Effekt aktiv.
     * @type {boolean}
     */
    active = true;
    /**
     * Die Abhängigkeiten des Effekts.
     * @type {Dep[]}
     */
    deps = [];
    /**
     * Der äußere Effekt.
     * @type {ReactiveEffect|undefined}
     */
    parent;
    /**
     * Die Referenz zur berechneten Referenz.
     * @type {ComputedReference}
     */
    computed;
    /**
     * Sind Rekursionen erlaubt.
     * @type {boolean}
     */
    allowRecurse;
    /**
     * Der Effekt soll beendet werden.
     * @type {boolean}
     */
    #deferStop;
    /**
     * Callback, wenn der Effekt beendet wurde.
     * @type {function(): void}
     */
    onStop;
    /**
     * Die zu überwachende Funktion.
     * @type {Function}
     */
    fn;
    /**
     * Der definierte Zeitplaner für den Effekt.
     * @type {EffectScheduler}
     */
    scheduler;

    /**
     * Konstruktor für den reaktiven Effekt.
     * @param {function(): *} fn - Die Funktion, die Überwacht werden soll
     * @param {EffectScheduler|null} [scheduler] - Der Zeitplaner für den Effekt
     * @param {EffectScope} [scope] - Der Effekt-Bereich, in dem sich der Effekt befindet
     */
    constructor(fn, scheduler = null, scope) {
        this.fn = fn;
        this.scheduler = scheduler;

        recordEffectScope(this, scope);
    }

    /**
     * Auslösen des Effekts.
     */
    run() {
        if (!this.active) {
            return this.fn();
        }

        let parent = activeEffect;
        const lastShouldTrack = shouldTrack;

        while (parent) {
            if (parent === this) {
                return;
            }

            parent = parent.parent;
        }

        try {
            this.parent = activeEffect;
            activeEffect = this;
            shouldTrack = true;

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

            activeEffect = this.parent;
            shouldTrack = lastShouldTrack;
            this.parent = undefined;

            if (this.#deferStop) {
                this.stop();
            }
        }
    }

    /**
     * Beendet den Effekt
     */
    stop() {
        if (activeEffect === this) {
            this.#deferStop = true;
        } else if (this.active) {
            cleanupEffect(this);

            if (this.onStop) {
                this.onStop();
            }

            this.active = false;
        }
    }
}

/**
 * Bereinigt den Effekt, indem die Angängigkeiten entfernt werden.
 * @param {ReactiveEffect} effect - Der Effekt
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
 * @param {(function(): *)|ReactiveEffectRunner} fn - Die Funktion, welche überwacht werden soll
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
 * Beendet den Effekt.
 * @param {ReactiveEffectRunner} runner - Der Effekt
 */
export function stop(runner) {
    runner.effect.stop();
}

/**
 * Flag zur Bestimmung, ob die Verfolgung im Moment aktiv ist.
 * @type {boolean}
 */
export let shouldTrack = true;

/**
 * Ein Speicher, der für die Ebenen speichert, ob diese verfolgt werden sollen.
 * @type {boolean[]}
 */
const trackStack = [];

/**
 * Pausiert die Verfolgung.
 */
export function pauseTracking() {
    trackStack.push(shouldTrack);
    shouldTrack = false;
}

/**
 * Schaltet die Verfolgung an.
 */
export function enableTracking() {
    trackStack.push(shouldTrack);
    shouldTrack = true;
}

/**
 * Setzt die Verfolgung zurück auf den letzten Stand.
 */
export function resetTracking() {
    const last = trackStack.pop();
    shouldTrack = last === undefined ? true : last;
}

/**
 * Fügt das Ziel zu den verfolgten Werten es aktive Effekts hinzu.
 * @param {Object} target - Ziel
 * @param {TrackOpType} type - Operation
 * @param {*} key - Der Schlüssel
 */
export function track(target, type, key) {
    if (shouldTrack && activeEffect) {
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
}

/**
 * Tracked die aktuelle Abhängigkeit, durch Hinzufügen zum aktiven Effekt.
 * @param {Dep} dep - Die Abhängigkeit
 */
export function trackEffects(dep) {
    let shouldTrack = false;

    if (effectTrackDepth <= maxMarkerBits) {
        if (!newTracked(dep)) {
            // Nochmals tracken
            dep.n |= trackOpBit;
            shouldTrack = !wasTracked(dep);
        }
    } else {
        // Vollständiges Reinigen
        shouldTrack = !dep.has(activeEffect);
    }

    if (shouldTrack) {
        dep.add(activeEffect);
        activeEffect?.deps.push(dep);
    }
}

/**
 * Auslösen, wenn sich der Wert des Ziels ändert, um alle Abhängigkeiten neu zu berechnen.
 * @param {Object} target - Das Ziel-Objekt
 * @param {TriggerOpType} type - Die Operation, die der Auslöser ist
 * @param {*} [key] - Der Schlüssel
 * @param {*} [newValue] - Der neue Wert
 */
export function trigger(target, type, key, newValue) {
    const depsMap = targetMap.get(target);

    if (!depsMap) {
        // Nie getracked
        return;
    }

    let deps = [];

    if (type === TriggerOpTypes.CLEAR) {
        // Die Kollektion wird gereinigt
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
 * Löst die Effekte aus.
 * @param {Dep} dep - Die Abhängigkeiten (Effekte)
 */
export function triggerEffects(dep) {
    const effects = isArray(dep) ? dep : [...dep];

    for (const effect of effects) {
        if (effect.computed) {
            triggerEffect(effect);
        }
    }

    for (const effect of effects) {
        if (!effect.computed) {
            triggerEffect(effect);
        }
    }
}

/**
 * Löst einen einzelnen Effekt aus.
 * @param {ReactiveEffect} effect - Der Effekt
 */
function triggerEffect(effect) {
    if (effect !== activeEffect || effect.allowRecurse) {
        if (effect.scheduler) {
            effect.scheduler();
        } else {
            effect.run();
        }
    }
}
