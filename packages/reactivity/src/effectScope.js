/**
 * Der aktive Effekt-Bereich.
 * @type {EffectScope}
 */
let activeEffectScope;

/**
 * Effekt-Bereich
 * @class
 */
export class EffectScope {
    /**
     * Ist der Scope aktiv.
     * @type {boolean}
     */
    active = true;
    /**
     * Die Effekte innerhalb des Bereichs.
     * @type {ReactiveEffect[]}
     */
    effects = [];
    /**
     * Funktionen zum Bereinigen.
     * @type {(function(): void)[]}
     */
    cleanups = [];
    /**
     * Andere Effekt-Bereiche innerhalb dieses Bereiches.
     * @type {EffectScope[]}
     */
    scopes;
    /**
     * Der äußere Effekt-Bereich.
     * @type {EffectScope}
     */
    parent;
    /**
     * Der Index des Bereichs innerhalb des äußeren Effekt-Bereichs.
     * @type {number}
     */
    index;

    /**
     * Der Konstruktor des Effekt-Bereichs.
     * @param {boolean} detached
     */
    constructor(detached = false) {
        if (!detached && activeEffectScope) {
            this.parent = activeEffectScope;
            this.index = (activeEffectScope.scopes || (activeEffectScope.scopes = [])).push(this) - 1;
        }
    }

    /**
     * Führt die Funktion innerhalb des Effekt-Bereichs aus.
     * @template {*} T
     * @param {function(): T} fn - Die Funktion
     * @returns {T} Gibt das Ergebnis der Funktion zurück
     */
    run(fn) {
        if (this.active) {
            const currentEffectScope = activeEffectScope;

            try {
                activeEffectScope = this;

                return fn();
            } finally {
                activeEffectScope = currentEffectScope;
            }
        }
    }

    /**
     * Aktiviert den Bereich (setzt diesen Bereich als aktiven Bereich).
     */
    on() {
        activeEffectScope = this;
    }

    /**
     * Deaktiviert den Bereich (setzt den parent-Bereich als aktiven Bereich).
     */
    off() {
        activeEffectScope = this.parent;
    }

    /**
     * Beendet den Bereich, indem alle enthaltenen Effekte und Effekt-Bereiche beendet werden.
     * @param {boolean} [fromParent] - Wurde vom parent initialisiert
     */
    stop(fromParent) {
        if (this.active) {
            let i, l;

            for (i = 0, l = this.effects.length; i < l; i++) {
                this.effects[i].stop();
            }

            for (i = 0, l = this.cleanups.length; i < l; i++) {
                this.cleanups[i]();
            }

            if (this.scopes) {
                for (i = 0, l = this.scopes.length; i < l; i++) {
                    this.scopes[i].stop(true);
                }
            }

            if (this.parent && !fromParent) {
                const last = this.parent.scopes?.pop();

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
 * Erzeugt einen neuen Effekt-Bereich.
 * @param {boolean} [detached] - Getrennt von den anderen Bereichen
 * @returns {EffectScope} Der neue Bereich
 */
export function effectScope(detached) {
    return new EffectScope(detached);
}

/**
 * Erfasst den Effekt beim Effekt-Bereich.
 * Falls kein Bereich übergeben wurde, wird der aktuelle genommen.
 * @param {ReactiveEffect} effect - Der Effekt
 * @param {EffectScope} [scope] - Der Effekt-Bereich
 */
export function recordEffectScope(effect, scope = activeEffectScope) {
    if (scope && scope.active) {
        scope.effects.push(effect);
    }
}

/**
 * Die übergebene Funktion wird aufgerufen, wenn der aktive Effekt-Bereich beendet wird.
 * @param {function(): void} fn - Die Funktion
 */
export function onScopeDispose(fn) {
    if (activeEffectScope) {
        activeEffectScope.cleanups.push(fn);
    }
}
