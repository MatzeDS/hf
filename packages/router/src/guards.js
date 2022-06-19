import { isESModule } from "../../shared/src/utils.js";
import { currentInstance, inject, onUnmounted } from "../../runtime/index.js";
import { createRouterError, ErrorTypes } from "./errors.js";
import { matchedRouteKey } from "./RouterView.js";

/**
 * Die Art des Wächters
 * @typedef {"beforeRouteEnter"|"beforeRouteUpdate"|"beforeRouteLeave"} GuardType
 */

/**
 *
 * @typedef {function(Object): *} NavigationGuardNextCallback
 */

/**
 * Die Rückgabe des Wächters
 * @typedef {void|Error|RouteLocationRaw|boolean|NavigationGuardNextCallback} NavigationGuardReturn
 */

/**
 * Eine Funktion um das Verhalten der Navigation zu beeinflussen.
 * @typedef {function():void|function(Error):void|function(RouteLocationRaw):void|function(boolean):void|function(NavigationGuardNextCallback):void} NavigationGuardNext
 */

/**
 * Wächter für die Navigation
 * @typedef {function(to: RouteLocationNormalized,from: RouteLocationNormalized,next: NavigationGuardNext): NavigationGuardReturn|Promise<NavigationGuardReturn>} NavigationGuard
 */

/**
 * Registriert den Wächter beim nächsten Routen-Eintrag.
 * @param {RouteRecord} record - Der Routen-Eintrag
 * @param {string} name - Der Art des Wächters
 * @param {NavigationGuard} guard - Der Wächter
 */
function registerGuard(record, name, guard) {
    const removeFromList = () => {
        record[name].delete(guard);
    };

    onUnmounted(removeFromList);

    record[name].add(guard);
}

/**
 * Der übergebene Wächter wird vor dem Verlassen der Route ausgeführt.
 * @param {NavigationGuard} leaveGuard - Der Wächter
 */
export function onBeforeRouteLeave(leaveGuard) {
    if (currentInstance) {
        const activeRecord = inject(matchedRouteKey, {}).value;

        if (activeRecord) {
            registerGuard(activeRecord, "leaveGuards", leaveGuard);
        }
    } else {
        console.warn(`registerGuard() can only be used inside setup().`);
    }
}

/**
 * Der übergebene Wächter wird vor dem Update der Route ausgeführt.
 * @param {NavigationGuard} updateGuard - Der Wächter
 */
export function onBeforeRouteUpdate(updateGuard) {
    if (currentInstance) {
        const activeRecord = inject(matchedRouteKey, {}).value;

        if (activeRecord) {
            registerGuard(activeRecord, "updateGuards", updateGuard);
        }
    } else {
        console.warn(`registerGuard() can only be used inside setup().`);
    }
}

/**
 * Erzeugt eine Funktion die einen Promise zurück liefert, in dem der Wächter ausgeführt wird.
 * @param {NavigationGuard} guard - Die Wächter-Funktion
 * @param {RouteLocationNormalized} to - Die Ziel-Location
 * @param {RouteLocationNormalized} from - Die Quell-Location
 * @param {RouteRecord} [record] - Der Eintrag der Route
 * @param {string} [name] - Der Name der Route
 * @returns {function(): Promise<void>} - Der erzeugte Promise
 */
export function guardToPromiseFn(guard, to, from, record, name) {
    const enterCallbackArray = record && (record.enterCallbacks[name] ??= []);

    return () =>
        new Promise((resolve, reject) => {
            const next = (valid) => {
                if (valid === false) {
                    reject(createRouterError(ErrorTypes.NAVIGATION_ABORTED, {from, to}));
                } else if (valid instanceof Error) {
                    reject(valid);
                } else if (isRouteLocation(valid)) {
                    reject(createRouterError(ErrorTypes.NAVIGATION_GUARD_REDIRECT, { from: to, to: valid }));
                } else {
                    if (enterCallbackArray && record?.enterCallbacks[name] === enterCallbackArray && typeof valid === "function") {
                        enterCallbackArray.push(valid);
                    }

                    resolve();
                }
            };

            const guardReturn = guard.call(record?.instances[name], to, from, next);
            let guardCall = Promise.resolve(guardReturn);

            if (guard.length < 3) {
                guardCall = guardCall.then(next);
            }

            guardCall.catch(err => reject(err));
        });
}

/**
 * Liefert die Wächter der Komponente.
 * @param {RouteRecord[]} matched - Die Einträge der Route
 * @param {GuardType} guardType - Die Art des Wächters
 * @param {RouteLocationNormalized} to - Die Ziel-Location
 * @param {RouteLocationNormalized} from - Die Quell-Location
 * @returns {Array<function(): Promise>} - Die Wächter der Komponente
 */
export function extractComponentGuards(matched, guardType, to, from) {
    const guards = [];

    for (const record of matched) {
        for (const name in record.components) {
            const rawComponent = record.components[name];

            if (guardType === "beforeRouteEnter" || record.instances[name]) {
                if (isRouteComponent(rawComponent)) {
                    const guard = rawComponent[guardType];
                    guard && guards.push(guardToPromiseFn(guard, to, from, record, name));
                } else {
                    const componentPromise = rawComponent();

                    guards.push(() =>
                        componentPromise.then(resolved => {
                            if (!resolved) {
                                return Promise.reject(
                                    new Error(`Couldn't resolve component "${name}" at "${record.path}"`)
                                );
                            }

                            const resolvedComponent = isESModule(resolved)
                                ? resolved.default
                                : resolved;

                            record.components[name] = resolvedComponent;

                            const guard = resolvedComponent[guardType];

                            return guard && guardToPromiseFn(guard, to, from, record, name)();
                        })
                    );
                }
            }
        }
    }

    return guards;
}

/**
 * Prüft, ob es sich um eine Komponente handelt.
 * @param {*} value
 * @returns {boolean}
 */
function isRouteComponent(value) {
    return typeof value === "object";
}

/**
 * Prüft, ob es sich um eine Location handelt.
 * @param {*} value
 * @returns {boolean}
 */
export function isRouteLocation(value) {
    return typeof value === "string" || (value && typeof value === "object");
}
