import { createRouterError, ErrorTypes } from "./errors.js";
import { isESModule } from "../shared/utils.js";

/**
 * @typedef {"beforeRouteEnter"|"beforeRouteUpdate"|"beforeRouteLeave"} GuardType
 */

/**
 * @typedef {function(Object): *} NavigationGuardNextCallback
 */

/**
 * @typedef {void|Error|RouteLocationRaw|boolean|NavigationGuardNextCallback} NavigationGuardReturn
 */

/**
 * @typedef {function():void|function(Error):void|function(RouteLocationRaw):void|function(boolean):void|function(NavigationGuardNextCallback):void} NavigationGuardNext
 */

/**
 * @typedef {function(to: RouteLocationNormalized,from: RouteLocationNormalized,next: NavigationGuardNext): NavigationGuardReturn|Promise<NavigationGuardReturn>} NavigationGuard
 */

/**
 *
 * @param {NavigationGuard} guard
 * @param {RouteLocationNormalized} to
 * @param {RouteLocationNormalized} from
 * @param {RouteRecord} [record]
 * @param {string} [name]
 * @returns {function(): Promise<void>}
 */
export function guardToPromiseFn(guard, to, from, record, name) {
    const enterCallbackArray = record && (record.enterCallbacks[name] = record.enterCallbacks[name] || []);

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
                    if (enterCallbackArray && record.enterCallbacks[name] === enterCallbackArray && typeof valid === "function") {
                        enterCallbackArray.push(valid);
                    }

                    resolve();
                }
            };

            const guardReturn = guard.call(record?.instance, to, from, next);
            let guardCall = Promise.resolve(guardReturn);

            if (guard.length < 3) {
                guardCall = guardCall.then(next);
            }

            guardCall.catch(err => reject(err));
        });
}

/**
 *
 * @param {RouteRecord} record
 * @param {GuardType} guardType
 * @param {RouteLocationNormalized} to
 * @param {RouteLocationNormalized} from
 * @returns {Array}
 */
export function extractComponentGuards(record, guardType, to, from) {
    const guards = [];
    const component = record.component;
    const name = record.name;

    if (component && (guardType === "beforeRouteEnter" || record.instance)) {
        if (isRouteComponent(component)) {
            const guard = component[guardType];
            guard && guards.push(guardToPromiseFn(guard, to, from, record, name));
        } else {
            let componentPromise = component();

            componentPromise = componentPromise.catch(console.error);

            guards.push(() =>
                componentPromise.then(resolved => {
                    if (!resolved) {
                        return Promise.reject(
                            new Error(`Couldn't resolve component from Page "${name}"`)
                        );
                    }

                    const resolvedComponent = isESModule(resolved)
                        ? resolved.default
                        : resolved;

                    record.component = resolvedComponent;

                    const guard = resolvedComponent[guardType];

                    return guard && guardToPromiseFn(guard, to, from, record, name)();
                })
            );
        }
    }

    return guards;
}

/**
 *
 * @param {RouteComponent} component
 * @returns {boolean}
 */
function isRouteComponent(component) {
    return typeof component === "object";
}

/**
 *
 * @param {*} route
 * @returns {boolean}
 */
export function isRouteLocation(route) {
    return typeof route === "string" || (route && typeof route === "object");
}
