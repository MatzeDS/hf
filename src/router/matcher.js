import { NOOP, assign } from "../shared/utils.js";
import { createRouterError, ErrorTypes } from "./errors.js";

/**
 * @typedef {PathParserOptions} RouteRecordRaw
 * @property {string} [path]
 * @property {string|string[]} [alias]
 * @property {RouteRecordName} [name]
 * @property {NavigationGuard|NavigationGuard[]} [beforeEnter]
 * @property {RouteMeta} [meta]
 * @property {RouteRecordRedirectOption} [redirect]
 * @property {RouteComponent|function(): Promise<RouteComponent>} [component]
 * @property {Record<string,RouteRecordProps>|boolean} [props]
 */

/**
 * @typedef {Object} RouterMatcher
 * @property {function(RouteRecordName|RouteRecordMatcher): void} removeRoute
 * @property {function(): RouteRecordMatcher[]} getRoutes
 * @property {function(MatcherLocationRaw,MatcherLocation): MatcherLocation} resolve
 * @property {function(RouteRecordRaw): void} addRoute
 * @property {function(RouteRecordName): RouteRecordMatcher} getRecordMatcher
 */

/**
 * @typedef {Object} RouteRecordMatcher
 * @property {function(string): boolean} test
 * @property {RouteRecord} record
 * @property {RouteRecordMatcher[]} alias
 * @property {function(PathParams): string} stringify
 */

/**
 * @typedef {RouteLocationRaw|function(to: RouteLocation): RouteLocationRaw} RouteRecordRedirectOption
 */

/**
 * @typedef {boolean|Record<string, *>|(function(to: RouteLocationNormalized): Record<string, *>)} RouteRecordProps
 */

/**
 * @typedef {Object} RouteComponent
 */

/**
 * @typedef {Object} ComponentInstance
 */

/**
 * @typedef {Object} RouteRecord
 * @property {string} path
 * @property {RouteRecordRedirectOption} redirect
 * @property {RouteRecordName} name
 * @property {RouteComponent|function(): Promise<RouteComponent>} component
 * @property {RouteMeta} meta
 * @property {RouteRecordProps} props
 * @property {NavigationGuard|NavigationGuard[]} beforeEnter
 * @property {Record<string, NavigationGuardNextCallback[]>} enterCallbacks
 * @property {ComponentInstance} [instance]
 * @property {RouteRecord} [aliasOf]
 */

/**
 * @typedef {string|Symbol} RouteRecordName
 */

/**
 * @typedef {Object} MatcherLocationRaw
 * @property {string} [name]
 * @property {string} [path]
 * @property {Object} [params]
 * @property {Object} [query]
 */

/**
 * @typedef {Object} MatcherLocation
 * @property {RouteRecordName} name
 * @property {string} path
 * @property {RouteParams} params
 * @property {RouteMeta} meta
 * @property {RouteRecord} matched
 */

/**
 * @typedef {Object} PathParserOptions
 */

/**
 * @typedef {Record<string, string|string[]>} PathParams
 */

/**
 *
 * @param {RouteRecordRaw[]} routes
 * @param {PathParserOptions} globalOptions
 * @returns {RouterMatcher}
 */
export function createRouterMatcher(routes, globalOptions) {
    const matchers = [];
    const matcherMap = new Map();
    const matcherOptions = mergeOptions(
        {},
        globalOptions
    );

    /**
     *
     * @param {RouteRecordName} name
     * @returns {RouteRecordMatcher}
     */
    function getRecordMatcher(name) {
        return matcherMap.get(name);
    }

    /**
     *
     * @param {RouteRecordRaw} record
     */
    function addRoute(record) {
        const mainNormalizedRecord = normalizeRouteRecord(record);
        const options = mergeOptions(matcherOptions, record);
        const normalizedRecords = [
            mainNormalizedRecord
        ];

        if ("alias" in record) {
            const aliases = typeof record.alias === "string" ? [record.alias] : record.alias;

            for (const alias of aliases) {
                normalizedRecords.push(
                    assign({}, mainNormalizedRecord, {
                        component: mainNormalizedRecord.component,
                        name: alias,
                        aliasOf: mainNormalizedRecord
                    })
                );
            }
        }

        let matcher;
        let originalMatcher;

        for (const normalizedRecord of normalizedRecords) {
            matcher = createRouteRecordMatcher(normalizedRecord, options);
            originalMatcher = originalMatcher || matcher;

            if (originalMatcher !== matcher) {
                originalMatcher.alias.push(matcher);
            }

            matcherMap.set(matcher.record.name, matcher);
        }

        return originalMatcher
            ? () => {
                removeRoute(originalMatcher);
            }
            : NOOP;
    }

    /**
     *
     * @param {RouteRecordName|RouteRecordMatcher} matcherRef
     */
    function removeRoute(matcherRef) {
        if (isRouteName(matcherRef)) {
            const matcher = matcherMap.get(matcherRef);

            if (matcher) {
                matcherMap.delete(matcherRef);
                matchers.splice(matchers.indexOf(matcher), 1);
                matcher.alias.forEach(removeRoute);
            }
        } else {
            const index = matchers.indexOf(matcherRef);

            if (index > -1) {
                matchers.splice(index, 1);

                if (matcherRef.record.name) {
                    matcherMap.delete(matcherRef.record.name);
                }

                matcherRef.alias.forEach(removeRoute);
            }
        }
    }

    /**
     *
     * @returns {RouteRecordMatcher[]}
     */
    function getRoutes() {
        return matchers;
    }

    /**
     *
     * @param {MatcherLocationRaw} location
     * @param {MatcherLocation} currentLocation
     * @returns {MatcherLocation}
     */
    function resolve(location, currentLocation) {
        let matcher;
        let params = {};
        let path;
        let name;

        if ("name" in location && location.name) {
            matcher = matcherMap.get(location.name);

            if (!matcher) {
                throw createRouterError(ErrorTypes.MATCHER_NOT_FOUND, {
                    location
                });
            }

            name = matcher.record.name;

            params = assign(
                paramsFromLocation(
                    currentLocation.params,
                    matcher.keys.filter(k => !k.optional).map(k => k.name)
                ),
                location.params
            );

            path = matcher.stringify(params);
        } else if ("path" in location) {
            path = location.path;
            matcher = matchers.find(m => m.test(path));

            if (matcher) {
                params = {};
                name = matcher.record.name;
            }
        } else {
            matcher = matcherMap.get(currentLocation.name);

            if (!matcher) {
                throw createRouterError(ErrorTypes.MATCHER_NOT_FOUND, {
                    location,
                    currentLocation,
                });
            }

            name = matcher.record.name;
            params = assign({}, currentLocation.params, location.params);
            path = matcher.stringify(params);
        }

        return {
            name,
            path,
            params,
            matched: matcher.record,
            meta: matcher.record.meta
        };
    }

    routes.forEach(route => addRoute(route));

    return {
        addRoute,
        resolve,
        removeRoute,
        getRoutes,
        getRecordMatcher
    };
}

/**
 *
 * @param {RouteParams} params
 * @param {string[]} keys
 * @returns {RouteParams}
 */
function paramsFromLocation(params, keys) {
    const newParams = {};

    for (const key of keys) {
        if (key in params) newParams[key] = params[key];
    }

    return newParams;
}

/**
 *
 * @param {RouteRecordRaw} record
 * @returns {RouteRecord}
 */
export function normalizeRouteRecord(record) {
    return {
        path: record.path || "/" + record.name,
        redirect: record.redirect,
        name: record.name,
        meta: record.meta || {},
        aliasOf: undefined,
        beforeEnter: record.beforeEnter,
        props: record.props,
        instance: undefined,
        enterCallbacks: {},
        component: record.component
    };
}

/**
 * @template T
 * @param {T} defaults
 * @param {Partial<T>} partialOptions
 * @returns {T}
 */
function mergeOptions(defaults, partialOptions) {
    const options = {};

    for (const key in defaults) {
        options[key] = key in partialOptions ? partialOptions[key] : defaults[key];
    }

    return options;
}

/**
 *
 * @param {RouteRecord} record
 * @param {PathParserOptions} [options]
 * @returns {RouteRecordMatcher}
 */
export function createRouteRecordMatcher(record, options) {
    /**
     *
     * @param {PathParams} params
     * @returns {string}
     */
    function stringify(params) {
        return record.path;
    }

    /**
     *
     * @param {string} path
     * @return {boolean}
     */
    function test(path) {
        return path.substring(1) === record.name;
    }

    return {
        record,
        alias: [],
        keys: [],
        stringify,
        test
    };
}

/**
 *
 * @param {*} name
 * @returns {boolean}
 */
export function isRouteName(name) {
    return typeof name === "string" || typeof name === "symbol";
}
