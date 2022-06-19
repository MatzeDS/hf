import { assign, hasOwn, isPlainObject } from "shared/index.js";
import { watch, nextTick } from "../../runtime/index.js";
import {
    computed,
    effectScope,
    isReactive,
    isRef,
    markRaw,
    reactive,
    readonly
} from "../../reactivity/index.js";
import {
    triggerSubscriptions,
    addSubscription
} from "./subscriptions.js";

/**
 * Eine Getter-Funktion.
 * @typedef {function(state: Proxy): *} StoreGetter
 */

/**
 * Eine Action-Funktion.
 * @typedef {function()} StoreAction
 */

/**
 * Der State eines Stores.
 * @typedef {Record<string|number|symbol, *>} StoreState
 */

/**
 * Die Optionen für das Abonnement.
 * @typedef {WatchOptions} SubscribeOptions
 * @property {boolean} [detached] - Das Abonnement ist unabhängig von der Komponente
 */

/**
 * Die Optionen für den Store.
 * @typedef {Object} StoreOptions
 * @property {function(): StoreState} [state] - Der initiale State
 * @property {Record<string, StoreGetter>} [getters] - Die Getters
 * @property {Record<string, StoreAction>} [actions] - Die Actions
 */

/**
 * @typedef {StoreState} Store
 * @property {$addGetter} $addGetter
 * @property {$addAction} $addAction
 * @property {$subscribe} $subscribe
 * @property {$patch} $patch
 * @property {$reset} $reset
 * @property {$dispose} $dispose
 */

/**
 * Alle aktiven Stores.
 * @type {Map<string, Proxy<Store>>}
 */
export const activeStores = new Map();

/**
 * Die Art der Mutation.
 * @enum {string} MutationType
 */
export const MutationType = {
    DIRECT: "DIRECT",
    PATCH_FUNCTION: "PATCH_FUNCTION",
    PATCH_OBJECT: "PATCH_OBJECT"
};

/**
 * Fügt zwei möglich weise reaktive Objekte zusammen.
 * @param {Proxy<StoreState>} target - Das Ziel-Objekt
 * @param {StoreState} source - Das Quell-Objekt
 * @returns {Proxy<StoreState>} Das Ziel-Objekt
 */
function mergeReactiveObjects(target, source) {
    for (const key in source) {
        if (hasOwn(source, key)) {
            const subPatch = source[key];
            const targetValue = target[key];

            if (
                isPlainObject(targetValue) &&
                isPlainObject(subPatch) &&
                hasOwn(target, key) &&
                !isRef(subPatch) &&
                !isReactive(subPatch)
            ) {
                target[key] = mergeReactiveObjects(targetValue, subPatch);
            } else {
                target[key] = subPatch;
            }
        }
    }

    return target;
}

/**
 * Erzeugt einen neuen Store.
 * @param {string} id - Eine eindeutige ID für den Store
 * @param {StoreOptions} options - Die Optionen für den Store
 * @return {Proxy<Store>} Der neue Store
 */
export function createStore(id, options = {}) {
    if (!id) {
        throw new Error("Missing Store ID.");
    }

    const { state, getters, actions } = options;

    const scope = effectScope();

    let isListening = false;
    let isSyncListening = false;

    const subscriptions = new Set();

    let activeListener;

    /**
     * Fügt ein Getter dem Store hinzu.
     * @param {string} key - Der Name des Getters
     * @param {StoreGetter} fn - Die Getter-Funktion
     */
    function $addGetter(key, fn) {
        internalStore[key] = scope.run(() =>
            markRaw(computed(() => fn.call(reactiveStore, reactiveStore)))
        );
    }

    /**
     * Fügt eine Action dem Store hinzu.
     * @param {string} key - Der Name der Action
     * @param {StoreAction} fn - Die Action-Funktion
     */
    function $addAction(key, fn) {
        internalStore[key] = function (...args) {
            let result;

            try {
                result = fn.apply(reactiveStore, args);
            } catch (error) {
                throw error;
            }

            return result;
        };
    }

    /**
     * Abonniert den Store, um auf Änderungen zu reagieren.
     * @param {Subscription} callback - Die Callback-Funktionen
     * @param {SubscribeOptions} [options] - Die Optionen für das Abonnement
     * @returns {function(): void} - Eine Funktion um das Abonnement zu beenden
     */
    function $subscribe(callback, options = {}) {
        const removeSubscription = addSubscription(
            subscriptions,
            callback,
            options.detached,
            () => stopWatcher()
        );

        const stopWatcher = scope.run(() => {
            return watch(
                () => reactiveStore,
                state => {
                    if (options.flush === "sync" ? isSyncListening : isListening) {
                        callback({
                            storeId: id,
                            type: MutationType.DIRECT
                        }, state);
                    }
                },
                assign({ deep: true }, options)
            );
        });

        return removeSubscription;
    }

    /**
     * Führt den neuen State mit dem Aktuellen zusammen.
     * @param {StoreState|function(state: StoreState): void} stateOrMutator
     */
    function $patch(stateOrMutator) {
        let subscriptionMutation;
        isListening = isSyncListening = false;

        if (typeof stateOrMutator === "function") {
            stateOrMutator(reactiveStore);

            subscriptionMutation = {
                storeId: id,
                type: MutationType.PATCH_FUNCTION
            };
        } else {
            mergeReactiveObjects(reactiveStore, stateOrMutator);

            subscriptionMutation = {
                storeId: id,
                type: MutationType.PATCH_OBJECT,
                payload: stateOrMutator
            };
        }

        const myListenerId = (activeListener = Symbol("ListenerId"));

        nextTick.then(() => {
            if (activeListener === myListenerId) {
                isListening = true;
            }
        });

        isSyncListening = true;

        triggerSubscriptions(
            subscriptions,
            subscriptionMutation,
            externalStore
        );
    }

    /**
     * Setzt den State zurück auf den Initialwert.
     */
    function $reset() {
        const newState = state ? state() : {};

        $patch(($state) => {
            assign($state, newState);
        });
    }

    /**
     * Beendet den Store und löst alle Abhängigkeiten auf.
     */
    function $dispose() {
        scope.stop();
        subscriptions.clear();

        activeStores.delete(id);
    }

    const internalStore = assign(
        state ? state() : {},
        {
            $addGetter,
            $addAction,
            $subscribe,
            $patch,
            $reset,
            $dispose
        }
    );
    const reactiveStore = reactive(internalStore);
    const externalStore = readonly(reactiveStore);

    getters && Object.entries(getters).forEach(([key, getter]) => {
        $addGetter(key, getter);
    });

    actions && Object.entries(actions).forEach(([key, action]) => {
        $addAction(key, action);
    });

    isListening = true;
    isSyncListening = true;

    activeStores.set(id, externalStore);

    return externalStore;
}
