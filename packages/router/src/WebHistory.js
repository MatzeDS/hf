import { removeTrailingSlash } from "./path.js";

/**
 * Der Lokation-Pfad
 * @typedef {string} HistoryLocation
 */

/**
 * Werte des History-States.
 * @typedef {string|number|boolean|null|undefined|HistoryState|HistoryStateArray} HistoryStateValue
 */

/**
 * Array-Teil des History-States.
 * @typedef {HistoryState[]} HistoryStateArray
 */

/**
 * Der State der History.
 * @typedef {Record<number|string,HistoryStateValue>} HistoryState
 */

/**
 * Der History-State-Eintrag.
 * @typedef {HistoryState} StateEntry
 * @property {HistoryLocation|null} back - Die vorherige Lokation
 * @property {HistoryLocation} current - Die aktuelle Lokation
 * @property {HistoryLocation|null} forward - Nachfolgende Lokation
 * @property {boolean} replaced - Wurde der State ersetzt?
 * @property {number} position - Die Position in der History
 */

/**
 * Beschreibt die History-Änderung.
 * @typedef {Object} HistoryMutation
 * @property {number} delta - Die Schritte die vor oder zurückgegangen wurden
 * @property {string} type - Die Art der Änderung
 * @property {string} direction - Die Richtung der Änderung (forward|back)
 */

/**
 * Callback-Funktion, die durch eine Änderung in der History ausgelöst wird.
 * @typedef {function(to: HistoryLocation, from: HistoryLocation, mutation: HistoryMutation): void} HistoryChangeCallback
 */

const BEFORE_HASH_RE = /^[^#]+#/;

/**
 * Die Arten der Navigation.
 * @enum {string} NavigationType
 */
export const NavigationType = {
    pop: "pop",
    push: "push"
};

/**
 * Entfernt die Basis vom Pfad, falls dieser mit der Basis beginnt.
 * @param {string} path - Der Pfad
 * @param {string} base - Die mögliche Basis des Pfads
 * @returns {string} Der Pfad ohne Basis
 */
export function stripBase(path, base) {
    if (!base || path.toLowerCase().indexOf(base.toLowerCase())) {
        return path;
    }

    return path.slice(base.length) || "/";
}

/**
 * Normalisiert den Basispfad.
 * @param {string} [base] - Der Basispfad
 * @returns {string} Der normalisierte Pfad
 */
export function normalizeBase(base) {
    let normalizedBase = base || "/";

    if (normalizedBase[0] !== "/" && normalizedBase[0] !== "#") {
        normalizedBase = "/" + normalizedBase;
    }

    return removeTrailingSlash(normalizedBase);
}

/**
 * Erzeugt die Basis-Lokation.
 * @returns {string} Die Basis-Lokation
 */
const createBaseLocation = () => location.protocol + "//" + location.host;

/**
 * Erzeugt die aktuelle Lokation.
 * @param {string} base - Der Basispfad
 * @param {Location} location - Die Lokation
 * @returns {HistoryLocation} Die aktuelle Lokation
 */
function createCurrentLocation(base, location) {
    const { pathname, search, hash } = location;
    const hashPos = base.indexOf("#");

    if (hashPos > -1) {
        let pathFromHash = hash.slice(1);

        if (pathFromHash[0] !== "/") {
            pathFromHash = "/" + pathFromHash;
        }

        return stripBase(pathFromHash, "");
    }

    const path = stripBase(pathname, base);

    return path + search + hash;
}

/**
 * Erzeugt einen State-Eintrag.
 * @param {HistoryLocation|null} back - Vorherige Lokation
 * @param {HistoryLocation} current - Aktuelle Lokation
 * @param {HistoryLocation|null} forward - Nachfolgende Lokation
 * @param {boolean} [replaced] - Wurde der State ersetzt
 * @returns {StateEntry} Der erstellte State-Eintrag
 */
function buildState(back, current, forward, replaced = false) {
    return {
        back,
        current,
        forward,
        replaced,
        position: window.history.length
    };
}


/**
 * Die Web-History.
 * @class
 */
export class WebHistory {
    /**
     * Die aktuelle Location.
     * @type {{value: HistoryLocation}}
     */
    #currentLocation;
    /**
     * Der aktuelle History-State.
     * @type {{value: HistoryState}}
     */
    #historyState;
    /**
     * Der State, der nicht überschrieben wird.
     * @type {HistoryLocation|null}
     */
    #pauseState = null;
    /**
     * Listener, die bei Änderungen der History getriggert werden.
     * @type {HistoryChangeCallback[]}
     */
    #listeners = [];
    /**
     * Funktionen, die die Listener entfernt.
     * @type {Array<function(): void>}
     */
    #teardowns = [];

    /**
     * Erzeugt die History für den Router.
     * @param {string} base - Der Basis-Pfad
     */
    constructor(base) {
        this.base = normalizeBase(base);
        const { history, location } = window;

        this.#currentLocation = {
            value: createCurrentLocation(this.base, location)
        };

        this.#historyState = { value: history.state };

        if (!this.#historyState.value) {
            this.changeLocation(
                this.#currentLocation.value,
                {
                    back: null,
                    current: this.#currentLocation.value,
                    forward: null,
                    position: history.length - 1,
                    replaced: true
                },
                true
            );
        }

        this.#popStateListener = this.#popStateListener.bind(this);
        this.#beforeUnloadListener = this.#beforeUnloadListener.bind(this);

        window.addEventListener("popstate", this.#popStateListener);
        window.addEventListener("beforeunload", this.#beforeUnloadListener);
    }

    /**
     * Die aktuelle Location.
     * @returns {HistoryLocation}
     */
    get location() {
        return this.#currentLocation.value;
    }

    /**
     * Der aktuelle History-State.
     * @returns {HistoryState}
     */
    get state() {
        return this.#historyState.value;
    }

    /**
     * Der Listener wird aufgerufen, um auf Änderungen der History zu reagieren.
     * @param {PopStateEvent} evt
     */
    #popStateListener(evt) {
        const to = createCurrentLocation(this.base, location);
        const from = this.#currentLocation.value;
        const fromState = this.#historyState.value;
        let delta = 0;

        if (evt.state) {
            this.#currentLocation.value = to;
            this.#historyState.value = evt.state;

            if (this.#pauseState && this.#pauseState === from) {
                this.#pauseState = null;

                return;
            }

            delta = fromState ? evt.state.position - fromState.position : 0;
        } else {
            this.replace(to);
        }

        this.#listeners.forEach(listener => {
            listener(this.#currentLocation.value, from, {
                delta,
                type: NavigationType.pop,
                direction: delta
                    ? delta > 0
                        ? "forward"
                        : "back"
                    : ""
            });
        });
    }

    /**
     * Pausiert die Ausführung von Callbacks, bis die History das nächte mal verändert wurde.
     */
    pauseListeners() {
        this.#pauseState = this.#currentLocation.value;
    }

    /**
     * Registriert die Callback-Funktion, um bei Änderungen der History darauf zu reagieren.
     * @param {HistoryChangeCallback} callback - Die Callback-Funktion
     * @returns {function(): void} Die Funktion entfernt die Funktion wieder
     */
    listen(callback) {
        this.#listeners.push(callback);

        const teardown = () => {
            const index = this.#listeners.indexOf(callback);

            if (index > -1) {
                this.#listeners.splice(index, 1);
            }
        };

        this.#teardowns.push(teardown);

        return teardown;
    }

    /**
     * Wird aufgerufen bevor die Seite geschlossen wird.
     */
    #beforeUnloadListener() {
        const { history } = window;

        if (!history.state) {
            return;
        }

        history.replaceState(
            Object.assign({}, history.state),
            ""
        );
    }

    /**
     * Beendet die Überwachung der History
     */
    destroy() {
        for (const teardown of this.#teardowns) {
            teardown();
        }

        this.#teardowns = [];
        window.removeEventListener("popstate", this.#popStateListener);
        window.removeEventListener("beforeunload", this.#beforeUnloadListener);
    }

    /**
     * Ändert die Lokation, durch Anpassung der History bzw. bei älteren Browsern der Location.
     * @param {HistoryLocation} to - Zielpfad
     * @param {StateEntry} state - State-Objekt für die History
     * @param {boolean} replace - Ersetzen der aktuellen Lokation
     */
    changeLocation(to, state, replace) {
        const hashIndex = this.base.indexOf("#");
        const url =
            hashIndex > -1
                ? this.base.slice(hashIndex) + to
                : createBaseLocation() + this.base + to;

        try {
            history[replace ? "replaceState" : "pushState"](state, "", url);
            this.#historyState.value = state;
        } catch (err) {
            console.error(err);
            location[replace ? "replace" : "assign"](url);
        }
    }

    /**
     * Ersetzt die aktuelle Lokation.
     * @param {HistoryLocation} to - Zielpfad
     * @param {HistoryState} [data] - State-Daten
     */
    replace(to, data) {
        const state = Object.assign(
            {},
            history.state,
            buildState(
                this.#historyState.value.back,
                to,
                this.#historyState.value.forward,
                true
            ),
            data,
            { position: this.#historyState.value.position }
        );

        this.changeLocation(to, state, true);
        this.#currentLocation.value = to;
    }

    /**
     * Ändert die aktuelle Lokation.
     * @param {HistoryLocation} to - Zielpfad
     * @param {HistoryState} [data] - State-Daten
     */
    push(to, data) {
        const currentState = Object.assign(
            {},
            this.#historyState.value,
            history.state,
            {
                forward: to
            }
        );

        this.changeLocation(currentState.current, currentState, true);

        const state = Object.assign(
            {},
            buildState(this.#currentLocation.value, to, null),
            { position: currentState.position + 1 },
            data
        );

        this.changeLocation(to, state, false);
        this.#currentLocation.value = to;
    }

    /**
     * Gehe die History vor oder zurück.
     * @param {number} delta - Die Anzahl der Schritte, bei negativer Zahl wird zurück gegangen
     * @param {boolean} triggerListeners - Wenn Falsch, wird keine Callback-Funktion bei der History-Änderung ausgeführt
     */
    go(delta, triggerListeners = true) {
        if (!triggerListeners) {
            this.pauseListeners();
        }

        history.go(delta);
    }

    /**
     * Erzeugt einen Hyper-Link.
     * @param {HistoryLocation} location - Die Ziel-Lokation
     * @returns {string} Der Hyper-Link
     */
    createHref(location) {
        return this.base.replace(BEFORE_HASH_RE, "#") + location;
    }
}
