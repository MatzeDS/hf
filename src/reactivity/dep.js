import { trackOpBit } from "./effect.js";

/**
 * @typedef {Set<ReactiveEffect>} Dep
 * @property {number} w - Bitmap für die Ebenen die verfolgt wurden
 * @property {number} n - Bitmap für die Ebenen die neu verfolgt werden
 */

/**
 *
 * @param {ReactiveEffect[]} [effects]
 * @returns {Dep}
 */
export const createDep = (effects) => {
    const dep = new Set(effects);
    dep.w = 0;
    dep.n = 0;

    return dep;
};

/**
 *
 * @param {Dep} dep
 * @returns {boolean}
 */
export const wasTracked = (dep) => (dep.w & trackOpBit) > 0;

/**
 *
 * @param {Dep} dep
 * @returns {boolean}
 */
export const newTracked = (dep) => (dep.n & trackOpBit) > 0;

/**
 *
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
 *
 * @param {ReactiveEffect} effect
 */
export const finalizeDepMarkers = (effect) => {
    const { deps } = effect;

    if (deps.length) {
        let ptr = 0;

        for (let i = 0; i < deps.length; i++) {
            const dep = deps[i];

            if (wasTracked(dep) && !newTracked(dep)) {
                dep.delete(effect);
            } else {
                deps[ptr++] = dep;
            }

            dep.w &= ~trackOpBit;
            dep.n &= ~trackOpBit;
        }

        deps.length = ptr;
    }
};
