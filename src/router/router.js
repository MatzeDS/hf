import { NOOP, assign, useCallbacks, applyToParams } from "../shared/utils.js";
import { createRouterMatcher } from "./matcher.js";
import { decode, encodeHash, encodeParam } from "./encoding.js";
import { normalizeQuery } from "../shared/query.js";
import { createRouterError, ErrorTypes, isNavigationFailure } from "./errors.js";
import { extractComponentGuards, guardToPromiseFn } from "./guards.js";
import { createWebHistory } from "./history.js";
import { ref } from "../reactivity/index.js";
import { parseURI, stringifyURI } from "../shared/uri.js";

/**
 * @typedef {Object} Router
 * @property {Reference<RouteLocationNormalized>} currentRoute
 * @property {function(RouteRecordRaw): (function(): void)} addRoute
 * @property {function(RouteRecordName): void} removeRoute
 * @property {function(RouteRecordName): void} hasRoute
 * @property {function(): RouteRecord[]} getRoutes
 * @property {RouterOptions} options
 * @property {function(RouteLocationRaw): RouteLocation & {href: string}} resolve
 * @property {function(RouteLocationRaw): Promise<NavigationFailure|void|undefined>} push
 * @property {function(RouteLocationRaw): Promise<NavigationFailure|void|undefined>} replace
 * @property {function(number): Promise<NavigationFailure|void|undefined>} go
 * @property {function(): Promise<NavigationFailure|void|undefined>} back
 * @property {function(): Promise<NavigationFailure|void|undefined>} forward
 * @property {function(NavigationGuard): function(): void} beforeEach
 * @property {function(NavigationGuard): function(): void} beforeResolve
 * @property {function(NavigationGuard): function(): void} afterEach
 * @property {function(Function): function(): void} onError
 * @property {function(): Promise<void>} isReady
 */

/**
 * @typedef {Record<string,string|number|(string|number)[]>} RouteParamsRaw
 */

/**
 * @typedef {Record<string, string|string[]>} RouteParams
 */

/**
 * @typedef {Object} RouteLocationOptions
 * @property {boolean} [replace]
 * @property {HistoryState} [state]
 */

/**
 * @typedef {string|{ name: RouteRecordName, [params]: RouteParamsRaw, [path]: string, [query]: LocationQueryRaw, [hash]: string }} RouteLocationRaw
 */

/**
 * @typedef {PathParserOptions} RouterOptions
 * @property {RouteRecordRaw[]} routes
 * @property {string} base
 */

/**
 * @typedef {Record<string|number|Symbol, *>} RouteMeta
 */

/**
 *
 * @typedef {Object} RouteLocation
 * @property {string} path
 * @property {string} fullPath
 * @property {LocationQuery} query
 * @property {string} hash
 * @property {RouteRecordName} name
 * @property {RouteParams} params
 * @property {RouteMeta} meta
 * @property {RouteRecord} matched
 */

/**
 * @typedef {RouteLocation} RouteLocationNormalized
 */

/**
 *
 * @type {RouteLocationNormalized}
 */
const START_LOCATION_NORMALIZED = {
    path: "/",
    name: undefined,
    params: {},
    query: {},
    hash: "",
    fullPath: "/",
    matched: undefined,
    meta: {},
    redirectedFrom: undefined,
};

/**
 *
 * @param {RouterOptions} options
 * @returns {Router}
 */
export default function createRouter(options) {
    const matcher = createRouterMatcher(options.routes, options);
    const routerHistory = createWebHistory(options.base);

    const beforeGuards = useCallbacks();
    const beforeResolveGuards = useCallbacks();
    const afterGuards = useCallbacks();

    const currentRoute = ref(START_LOCATION_NORMALIZED);
    let pendingLocation = START_LOCATION_NORMALIZED;

    const normalizeParams = applyToParams.bind(null, paramValue => String(paramValue));
    const encodeParams = applyToParams.bind(null, encodeParam);
    const decodeParams = applyToParams.bind(null, decode);

    /**
     *
     * @param {RouteRecordRaw} route
     */
    function addRoute(route) {
        return matcher.addRoute(route);
    }

    /**
     *
     * @param {RouteRecordName} name
     */
    function removeRoute(name) {
        const recordMatcher = matcher.getRecordMatcher(name);

        if (recordMatcher) {
            matcher.removeRoute(recordMatcher);
        }
    }

    /**
     *
     * @returns {RouteRecord[]}
     */
    function getRoutes() {
        return matcher.getRoutes().map(routeMatcher => routeMatcher.record);
    }

    /**
     *
     * @param {RouteRecordName} name
     * @returns {boolean}
     */
    function hasRoute(name) {
        return !!matcher.getRecordMatcher(name);
    }

    /**
     *
     * @param {RouteRecordName} name
     * @return {RouteRecord|null}
     */
    function getRoute(name) {
        const match = matcher.getRecordMatcher(name);

        return match ? match.record : null;
    }

    /**
     *
     * @param {RouteLocationRaw} rawLocation
     * @param {RouteLocationNormalized} [currentLocation]
     * @returns {RouteLocation & { href: string }}
     */
    function resolve(rawLocation, currentLocation) {
        const routeLocation = assign({}, currentLocation || currentRoute.value);

        if (typeof rawLocation === "string") {
            const locationNormalized = parseURI(rawLocation, routeLocation.path);
            const matchedRoute = matcher.resolve(
                { path: locationNormalized.path },
                routeLocation
            );

            const href = routerHistory.createHref(locationNormalized.fullPath);

            return assign(
                locationNormalized,
                matchedRoute,
                {
                    params: decodeParams(matchedRoute.params),
                    hash: decode(locationNormalized.hash),
                    redirectedFrom: undefined,
                    href
                }
            );
        }

        let matcherLocation;

        if ("path" in rawLocation) {
            matcherLocation = assign({}, rawLocation, {
                path: parseURI(rawLocation.path, routeLocation.path).path
            });
        } else {
            matcherLocation = assign({}, rawLocation, {
                params: encodeParams(rawLocation.params)
            });

            routeLocation.params = encodeParams(routeLocation.params);
        }

        const matchedRoute = matcher.resolve(matcherLocation, routeLocation);
        const hash = rawLocation.hash || "";

        matchedRoute.params = normalizeParams(decodeParams(matchedRoute.params));

        const fullPath = stringifyURI(
            assign({}, rawLocation, {
                hash: encodeHash(hash),
                path: matchedRoute.path,
            })
        );

        const href = routerHistory.createHref(fullPath);

        return assign(
            {
                fullPath,
                hash,
                query: normalizeQuery(rawLocation.query)
            },
            matchedRoute,
            {
                redirectedFrom: undefined,
                href
            }
        );
    }

    /**
     *
     * @param {RouteLocationRaw|RouteLocationNormalized} to
     * @returns {Exclude<RouteLocationRaw, string> | RouteLocationNormalized}
     */
    function locationAsObject(to) {
        return typeof to === "string" ? { path: to } : assign({}, to);
    }

    /**
     *
     * @param {RouteLocationNormalized} to
     * @param {RouteLocationNormalized} from
     * @returns {NavigationFailure}
     */
    function checkCanceledNavigation(to, from) {
        if (pendingLocation !== to) {
            return createRouterError(ErrorTypes.NAVIGATION_CANCELLED, {
                from,
                to
            });
        }
    }

    /**
     *
     * @param {RouteLocationRaw} to
     * @returns {Promise<NavigationFailure|void|undefined>}
     */
    function push(to) {
        return pushWithRedirect(to);
    }

    /**
     *
     * @param {RouteLocationRaw} to
     * @returns {Promise<NavigationFailure|void|undefined>}
     */
    function replace(to) {
        return push(assign(locationAsObject(to), { replace: true }));
    }

    /**
     *
     * @param {RouteLocation} to
     * @returns {RouteLocationRaw}
     */
    function handleRedirectRecord(to) {
        const lastMatched = to.matched;

        if (lastMatched && lastMatched.redirect) {
            const { redirect } = lastMatched;
            const newTargetLocation = locationAsObject(
                typeof redirect === "function" ? redirect(to) : redirect
            );

            return assign(
                {
                    query: to.query,
                    hash: to.hash,
                    params: to.params,
                },
                newTargetLocation
            );
        }
    }

    /**
     *
     * @param {RouteLocationRaw|RouteLocation|RouteLocationOptions} to
     * @param {RouteLocation} [redirectedFrom]
     * @returns {Promise<NavigationFailure|void|undefined>}
     */
    function pushWithRedirect(to, redirectedFrom) {
        const targetLocation = pendingLocation = resolve(to);
        const from = currentRoute.value;
        const data = to.state;
        const replace = to.replace === true || isSameRouteRecord(from.matched, targetLocation.matched);
        const shouldRedirect = handleRedirectRecord(targetLocation);

        if (shouldRedirect) {
            return pushWithRedirect(
                assign(shouldRedirect, { state: data, replace }),
                redirectedFrom || targetLocation
            );
        }

        const toLocation = targetLocation;

        toLocation.redirectedFrom = redirectedFrom;

        return navigate(toLocation, from)
            .catch(error => isNavigationFailure(error)
                ? error
                : triggerError(error)
            )
            .then(error => {
                let failure = error;

                if (failure) {
                    if (isNavigationFailure(failure, ErrorTypes.NAVIGATION_GUARD_REDIRECT)) {
                        return pushWithRedirect(
                            assign(locationAsObject(failure.to), {
                                state: data,
                                replace,
                            }),
                            redirectedFrom || toLocation
                        );
                    }
                } else {
                    failure = finalizeNavigation(
                        toLocation,
                        from,
                        true,
                        replace,
                        data
                    );
                }

                triggerAfterEach(
                    toLocation,
                    from,
                    failure
                );

                return failure;
            });
    }

    /**
     *
     * @param {RouteLocationNormalized} to
     * @param {RouteLocationNormalized} from
     * @returns {Promise<void>}
     */
    function checkCanceledNavigationAndReject(to, from) {
        const error = checkCanceledNavigation(to, from);

        return error ? Promise.reject(error) : Promise.resolve();
    }

    /**
     *
     * @param {RouteLocationNormalized} to
     * @param {RouteLocationNormalized} from
     * @returns {Promise}
     */
    function navigate(to, from) {
        const leavingRecord = from.matched;
        const enteringRecord = to.matched;

        let guards = leavingRecord
            ? extractComponentGuards(
                leavingRecord,
                "beforeRouteLeave",
                to,
                from
            )
            : [];

        const canceledNavigationCheck = checkCanceledNavigationAndReject.bind(
            null,
            to,
            from
        );

        guards.push(canceledNavigationCheck);

        return (
            runGuardQueue(guards)
                .then(() => {
                    guards = [];

                    for (const guard of beforeGuards.list()) {
                        guards.push(guardToPromiseFn(guard, to, from));
                    }

                    guards.push(canceledNavigationCheck);

                    return runGuardQueue(guards);
                })
                .then(() => {
                    guards = [];

                    if (enteringRecord.beforeEnter) {
                        if (Array.isArray(enteringRecord.beforeEnter)) {
                            for (const beforeEnter of enteringRecord.beforeEnter) {
                                guards.push(guardToPromiseFn(beforeEnter, to, from));
                            }
                        } else {
                            guards.push(guardToPromiseFn(enteringRecord.beforeEnter, to, from));
                        }
                    }

                    guards.push(canceledNavigationCheck);

                    return runGuardQueue(guards);
                })
                .then(() => {
                    enteringRecord.enterCallbacks = {};

                    guards = extractComponentGuards(
                        enteringRecord,
                        "beforeRouteEnter",
                        to,
                        from
                    );

                    guards.push(canceledNavigationCheck);

                    return runGuardQueue(guards);
                })
                .then(() => {
                    guards = [];

                    for (const guard of beforeResolveGuards.list()) {
                        guards.push(guardToPromiseFn(guard, to, from));
                    }

                    guards.push(canceledNavigationCheck);

                    return runGuardQueue(guards);
                })
                .catch(err => isNavigationFailure(err, ErrorTypes.NAVIGATION_CANCELLED)
                    ? Promise.resolve(err)
                    : Promise.reject(err)
                )
        );
    }

    /**
     *
     * @param {RouteLocationNormalized} to
     * @param {RouteLocationNormalized} from
     * @param {NavigationFailure} [failure]
     */
    function triggerAfterEach(to, from, failure) {
        for (const guard of afterGuards.list()) {
            guard(to, from, failure);
        }
    }

    /**
     *
     * @param {RouteLocationNormalized} toLocation
     * @param {RouteLocationNormalized} from
     * @param {boolean} isPush
     * @param {boolean} [replace]
     * @param {HistoryState} [data]
     * @returns {NavigationFailure}
     */
    function finalizeNavigation(toLocation, from, isPush, replace, data) {
        const error = checkCanceledNavigation(toLocation, from);

        if (error) {
            return error;
        }

        const isFirstNavigation = from === START_LOCATION_NORMALIZED;

        if (isPush) {
            if (replace || isFirstNavigation) {
                routerHistory.replace(toLocation.fullPath, data);
            } else {
                routerHistory.push(toLocation.fullPath, data);
            }
        }

        currentRoute.value = toLocation;

        markAsReady();
    }

    /**
     *
     */
    function setupListeners() {
        routerHistory.listen((to, _from, info) => {
            const toLocation = resolve(to);
            const shouldRedirect = handleRedirectRecord(toLocation);

            if (shouldRedirect) {
                pushWithRedirect(
                    assign(shouldRedirect, { replace: true }),
                    toLocation
                ).catch(NOOP);

                return;
            }

            pendingLocation = toLocation;
            const from = currentRoute.value;

            navigate(toLocation, from)
                .catch(error => {
                    if (isNavigationFailure(error, ErrorTypes.NAVIGATION_ABORTED | ErrorTypes.NAVIGATION_CANCELLED)) {
                        return error;
                    }

                    if (isNavigationFailure(error, ErrorTypes.NAVIGATION_GUARD_REDIRECT)) {
                        if (info.delta) {
                            routerHistory.go(-info.delta, false);
                        }

                        pushWithRedirect(error.to, toLocation).catch(NOOP);

                        return Promise.reject();
                    }

                    if (info.delta) {
                        routerHistory.go(-info.delta, false);
                    }

                    return triggerError(error);
                })
                .then(error => {
                    const failure = error || finalizeNavigation(toLocation, from, false);

                    if (failure && info.delta) {
                        routerHistory.go(-info.delta, false);
                    }

                    triggerAfterEach(toLocation, from, failure);
                })
                .catch(NOOP);
        });
    }

    const readyHandlers = useCallbacks();
    const errorHandlers = useCallbacks();
    let ready;

    /**
     *
     * @param {*} error
     * @returns {Promise}
     */
    function triggerError(error) {
        markAsReady(error);
        errorHandlers.list().forEach(handler => handler(error));

        return Promise.reject(error);
    }

    /**
     *
     * @returns {Promise<void>}
     */
    function isReady() {
        if (ready && currentRoute.value !== START_LOCATION_NORMALIZED) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            readyHandlers.add((err) => (err ? reject(err) : resolve()));
        });
    }

    /**
     *
     * @param {*} [err]
     */
    function markAsReady(err) {
        if (ready) {
            return;
        }

        ready = true;
        setupListeners();
        readyHandlers.list().forEach(handler => handler(err));
        readyHandlers.reset();
    }

    /**
     *
     * @param {number} delta
     */
    const go = (delta) => routerHistory.go(delta);

    return {
        currentRoute,

        addRoute,
        removeRoute,
        hasRoute,
        getRoute,
        getRoutes,
        resolve,
        options,

        push,
        replace,
        go,
        back: () => go(-1),
        forward: () => go(1),

        beforeEach: beforeGuards.add,
        beforeResolve: beforeResolveGuards.add,
        afterEach: afterGuards.add,

        onError: errorHandlers.add,
        isReady
    };
}

/**
 *
 * @param {NavigationGuard[]} guards
 * @returns {Promise<void>}
 */
function runGuardQueue(guards) {
    return guards.reduce(
        (promise, guard) => promise.then(() => guard()),
        Promise.resolve()
    );
}

/**
 * Check if two `RouteRecords` are equal. Takes into account aliases: they are
 * considered equal to the `RouteRecord` they are aliasing.
 *
 * @param {RouteRecord} a - first
 * @param {RouteRecord} b - second
 */
function isSameRouteRecord(a, b) {
    return (a && (a.aliasOf || a)) === (b && (b.aliasOf || b));
}
