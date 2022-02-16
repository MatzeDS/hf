import { stripBase, removeTrailingSlash } from "../shared/path.js";

/**
 * @typedef {string} HistoryLocation
 */

/**
 * @typedef {string|number|boolean|null|undefined|HistoryState|HistoryStateArray} HistoryStateValue
 */

/**
 * @typedef {HistoryState[]} HistoryStateArray
 */

/**
 * @typedef {Record<number|string,HistoryStateValue>} HistoryState
 */

/**
 * @typedef {HistoryState} StateEntry
 * @property {HistoryLocation|null} back
 * @property {HistoryLocation} current
 * @property {HistoryLocation|null} forward
 * @property {boolean} replaced
 * @property {number} position
 */

/**
 * @typedef {Object} RouterHistory
 * @property {HistoryLocation} location
 * @property {HistoryState} state
 * @property {string} base
 * @property {function} go
 * @property {function} createHref
 * @property {function} push
 * @property {function} replace
 * @property {function} listen
 * @property {function} pauseListeners
 * @property {function} destroy
 */

/**
 *
 * @param {string} [base]
 * @returns {string}
 */
export function normalizeBase(base) {
    let normalizedBase = base || "/";

    if (normalizedBase[0] !== "/" && normalizedBase[0] !== "#") {
        normalizedBase = "/" + normalizedBase;
    }

    return removeTrailingSlash(normalizedBase);
}

const BEFORE_HASH_RE = /^[^#]+#/;

/**
 *
 * @param {string} base
 * @param {HistoryLocation} location
 * @returns {string}
 */
function createHref(base, location) {
    return base.replace(BEFORE_HASH_RE, "#") + location;
}

/**
 *
 * @returns {string}
 */
const createBaseLocation = () => location.protocol + "//" + location.host;


/**
 *
 * @param {string} base
 * @param {Location} location
 * @returns {HistoryLocation}
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
 *
 * @param {string} base
 * @param {Reference<HistoryState>} historyState
 * @param {Reference<HistoryLocation>} currentLocation
 * @param {function} replace
 * @returns {{destroy: function, pauseListeners: function, listen: (function(Function): function(): void)}}
 */
function useHistoryListeners(base, historyState, currentLocation, replace) {
    const listeners = [];
    let teardowns = [];
    let pauseState = null;

    const popStateHandler = ({ state }) => {
        const to = createCurrentLocation(base, location);
        const from = currentLocation.value;
        const fromState = historyState.value;
        let delta = 0;

        if (state) {
            currentLocation.value = to;
            historyState.value = state;

            if (pauseState && pauseState === from) {
                pauseState = null;

                return;
            }

            delta = fromState ? state.position - fromState.position : 0;
        } else {
            replace(to);
        }

        listeners.forEach(listener => {
            listener(currentLocation.value, from, {
                delta,
                type: "pop",
                direction: delta
                    ? delta > 0
                        ? "forward"
                        : "back"
                    : ""
            });
        });
    };

    /**
     *
     */
    function pauseListeners() {
        pauseState = currentLocation.value;
    }

    /**
     *
     * @param {function} callback
     * @returns {function}
     */
    function listen(callback) {
        listeners.push(callback);

        /**
         *
         */
        const teardown = () => {
            const index = listeners.indexOf(callback);

            if (index > -1) {
                listeners.splice(index, 1);
            }
        };

        teardowns.push(teardown);

        return teardown;
    }

    function beforeUnloadListener() {
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
     *
     */
    function destroy() {
        for (const teardown of teardowns) {
            teardown();
        }

        teardowns = [];
        window.removeEventListener("popstate", popStateHandler);
        window.removeEventListener("beforeunload", beforeUnloadListener);
    }

    window.addEventListener("popstate", popStateHandler);
    window.addEventListener("beforeunload", beforeUnloadListener);

    return {
        pauseListeners,
        listen,
        destroy
    };
}

/**
 *
 * @param {HistoryLocation|null} back
 * @param {HistoryLocation} current
 * @param {HistoryLocation|null} forward
 * @param {boolean} [replaced]
 * @returns {StateEntry}
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
 *
 * @param {string} base
 * @returns {{ location: Reference<HistoryLocation>, state: Reference<StateEntry>, push: function, replace: function }}
 */
function useHistoryStateNavigation(base) {
    const { history, location } = window;

    const currentLocation = {
        value: createCurrentLocation(base, location)
    };

    const historyState = { value: history.state };

    if (!historyState.value) {
        changeLocation(
            currentLocation.value,
            {
                back: null,
                current: currentLocation.value,
                forward: null,
                position: history.length - 1,
                replaced: true
            },
            true
        );
    }

    /**
     *
     * @param {HistoryLocation} to
     * @param {StateEntry} state
     * @param {boolean} replace
     */
    function changeLocation(to, state, replace) {
        const hashIndex = base.indexOf("#");
        const url =
            hashIndex > -1
                ? base.slice(hashIndex) + to
                : createBaseLocation() + base + to;

        try {
            history[replace ? "replaceState" : "pushState"](state, "", url);
            historyState.value = state;
        } catch (err) {
            console.error(err);
            location[replace ? "replace" : "assign"](url);
        }
    }

    /**
     *
     * @function replace
     * @param {HistoryLocation} to
     * @param {HistoryState} [data]
     */
    function replace(to, data) {
        const state = Object.assign(
            {},
            history.state,
            buildState(
                historyState.value.back,
                to,
                historyState.value.forward,
                true
            ),
            data,
            { position: historyState.value.position }
        );

        changeLocation(to, state, true);
        currentLocation.value = to;
    }

    /**
     * @function push
     * @param {HistoryLocation} to
     * @param {HistoryState} [data]
     */
    function push(to, data) {
        const currentState = Object.assign(
            {},
            historyState.value,
            history.state,
            {
                forward: to
            }
        );

        changeLocation(currentState.current, currentState, true);

        const state = Object.assign(
            {},
            buildState(currentLocation.value, to, null),
            { position: currentState.position + 1 },
            data
        );

        changeLocation(to, state, false);
        currentLocation.value = to;
    }

    return {
        location: currentLocation,
        state: historyState,
        push,
        replace
    };
}

/**
 *
 * @param {string} base
 * @returns {RouterHistory}
 */
export function createWebHistory(base) {
    const normalizedBase = normalizeBase(base);

    const historyNavigation = useHistoryStateNavigation(normalizedBase);
    const historyListeners = useHistoryListeners(
        normalizedBase,
        historyNavigation.state,
        historyNavigation.location,
        historyNavigation.replace
    );

    /**
     *
     * @param {number} delta
     * @param {boolean} triggerListeners
     */
    function go(delta, triggerListeners = true) {
        if (!triggerListeners) {
            historyListeners.pauseListeners();
        }

        history.go(delta);
    }

    const routerHistory = Object.assign(
        {
            base: normalizedBase,
            go,
            createHref: createHref.bind(null, normalizedBase)
        },
        historyNavigation,
        historyListeners
    );

    Object.defineProperty(routerHistory, "location", {
        get: () => historyNavigation.location.value
    });

    Object.defineProperty(routerHistory, "state", {
        get: () => historyNavigation.state.value
    });

    return routerHistory;
}
