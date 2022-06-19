import { NOOP } from "../../shared/index.js";
import { currentInstance, onUnmounted } from "../../runtime/index.js";

/**
 * @typedef {function({ storeId: string, type: MutationType }, Proxy): void} Subscription
 */

/**
 * Löst alle Callback-Funktionen des Abonnements aus.
 * @param {Set<Subscription>} subscriptions - Die Callback-Funktionen
 * @param {...*} args - Die Argumente für die Callback-Funktionen
 */
export function triggerSubscriptions(subscriptions, ...args) {
    subscriptions.forEach(callback => {
        callback(...args);
    });
}

/**
 * Fügt eine neue Callback-Funktion den Abonnements hinzu.
 * @param {Set<Subscription>} subscriptions - Die Callback-Funktionen
 * @param {Subscription} callback - Die Callback-Funktion
 * @param {boolean} [detached] - Freistehend (außerhalb einer Komponente)
 * @param {function(): void} [onCleanup] - Funktion zum Aufräumen, wird nach dem Entfernen der Callback-Funktion aufgerufen
 * @returns {function(): void} Funktion zum Entfernen der Callback-Funktion
 */
export function addSubscription(subscriptions, callback, detached, onCleanup = NOOP) {
    subscriptions.add(callback);

    const removeSubscription = () => {
        subscriptions.delete(callback);
        onCleanup();
    };

    if (!detached && currentInstance) {
        onUnmounted(removeSubscription);
    }

    return removeSubscription;
}
