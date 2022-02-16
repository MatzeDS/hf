/**
 * @type {EffectScope}
 */
let activeEffectScope;

/**
 * @type {EffectScope[]}
 */
const effectScopeStack = [];

/**
 *
 */
export class EffectScope {
    /**
     *
     * @param {boolean} detached
     */
    constructor(detached = false) {
        /**
         *
         * @type {boolean}
         */
        this.active = true;

        /**
         *
         * @type {ReactiveEffect[]}
         */
        this.effects = [];

        /**
         *
         * @type {(function(): void)[]}
         */
        this.cleanups = [];

        /**
         * @type {EffectScope[]}
         */
        this.scopes = undefined;

        if (!detached && activeEffectScope) {
            /**
             *
             * @type {EffectScope}
             */
            this.parent = activeEffectScope;

            /**
             *
             * @type {number}
             */
            this.index = (activeEffectScope.scopes || (activeEffectScope.scopes = [])).push(this) - 1;
        }
    }

    run(fn) {
        if (this.active) {
            try {
                this.on();

                return fn();
            } finally {
                this.off();
            }
        }
    }

    on() {
        if (this.active) {
            effectScopeStack.push(this);
            activeEffectScope = this;
        }
    }

    off() {
        if (this.active) {
            effectScopeStack.pop();
            activeEffectScope = effectScopeStack[effectScopeStack.length - 1];
        }
    }

    /**
     *
     * @param {boolean} [fromParent]
     */
    stop(fromParent) {
        if (this.active) {
            this.effects.forEach(e => e.stop());
            this.cleanups.forEach(cleanup => cleanup());

            if (this.scopes) {
                this.scopes.forEach(e => e.stop(true));
            }

            if (this.parent?.scopes && !fromParent) {
                const last = this.parent.scopes.pop();

                if (last && last !== this) {
                    this.parent.scopes[this.index] = last;
                    last.index = this.index;
                }
            }

            this.active = false;
        }
    }
}

/**
 *
 * @param {boolean} detached
 * @returns {EffectScope}
 */
export function effectScope(detached) {
    return new EffectScope(detached);
}

/**
 *
 * @param {ReactiveEffect} effect
 * @param {EffectScope|null} [scope]
 */
export function recordEffectScope(effect, scope = null) {
    scope = scope || activeEffectScope;

    if (scope && scope.active) {
        scope.effects.push(effect);
    }
}

/**
 *
 * @returns {EffectScope}
 */
export function getCurrentScope() {
    return activeEffectScope;
}

/**
 *
 * @param {function(): void} fn
 */
export function onScopeDispose(fn) {
    if (activeEffectScope) {
        activeEffectScope.cleanups.push(fn);
    }
}
