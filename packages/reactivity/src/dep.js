import { trackOpBit } from "./effect.js";

/**
 * Die Abhängigkeiten (Effekte).
 * Zur rekursiven Effektverfolgung werden die Bitmaps w (schon verfolgte Ebenen) und
 * n (noch zu verfolgende Ebenen) verwendet.
 * Ein Bit entspricht einer Ebene, die verwendet wird, für die Verfolgung der Abhängigkeiten.
 * @typedef {Set<ReactiveEffect>} Dep
 * @property {number} w - Bitmap für die Ebenen die verfolgt wurden
 * @property {number} n - Bitmap für die Ebenen die neu verfolgt werden
 */

/**
 * Erzeugt eine Liste mit Abhängigkeiten (Effekte).
 * @param {ReactiveEffect[]} [effects] - Die Effekte
 * @returns {Dep} Die Liste der Abhängigkeiten
 */
export const createDep = (effects) => {
    const dep = new Set(effects);
    dep.w = 0;
    dep.n = 0;

    return dep;
};

/**
 * Wurden die Abhängigkeiten in der aktuellen Ebene schon getrackt?
 * @param {Dep} dep - Die Abhängigkeiten
 * @returns {boolean} Wahr, wenn sie schon getrackt wurden
 */
export const wasTracked = (dep) => (dep.w & trackOpBit) > 0;

/**
 * Sollen die Abhängigkeiten in der aktuellen Ebene noch getrackt werden?
 * @param {Dep} dep - Die Abhängigkeiten
 * @returns {boolean} Wahr, wenn sie noch getrackt werden sollen
 */
export const newTracked = (dep) => (dep.n & trackOpBit) > 0;

/**
 * Initialisiert die Bitmap der Abhängigkeiten,
 * indem das aktuelle Track-Bit in die Bitmap der Abhängigkeiten eingetragen wird.
 * @param {ReactiveEffect}
 */
export const initDepMarkers = ({ deps }) => {
    if (deps.length) {
        for (let i = 0; i < deps.length; i++) {
            deps[i].w |= trackOpBit;
        }
    }
};

/**
 * Finalisiert die Bitmaps für die Effektverfolgung, des Effekts.
 * @param {ReactiveEffect} effect - Der Effekt
 */
export const finalizeDepMarkers = (effect) => {
    const { deps } = effect;

    if (deps.length) {
        let ptr = 0;

        for (let i = 0; i < deps.length; i++) {
            const dep = deps[i];

            // Wenn die Abhängigkeit in der aktuellen Ebene schon verfolgt wurde und
            // nicht mehr verfolgt werden soll, wird sie entfernt
            if (wasTracked(dep) && !newTracked(dep)) {
                dep.delete(effect);
            } else {
                deps[ptr++] = dep;
            }

            // Entfernt die aktuelle Ebene aus den Bitmaps
            dep.w &= ~trackOpBit;
            dep.n &= ~trackOpBit;
        }

        deps.length = ptr;
    }
};
