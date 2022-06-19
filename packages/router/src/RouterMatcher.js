import { NOOP, assign } from "../../shared/src/utils.js";
import { createRouterError, ErrorTypes } from "./errors.js";
import { RouteRecord } from "./RouteRecord.js";
import {
    RouteRecordMatcher,
    comparePathScore,
    isAliasRecord,
    isRecordChildOf
} from "./RecordMatcher.js";

/**
 * Die Rohdaten für die Konfiguration einer Route.
 * @typedef {PathOptions} RouteRecordRaw
 * @property {string} [path]
 * @property {string|string[]} [alias]
 * @property {RouteRecordName} [name]
 * @property {NavigationGuard|NavigationGuard[]} [beforeEnter]
 * @property {RouteMeta} [meta] - Die Metadaten für die Route
 * @property {RouteRecordRedirectOption} [redirect]
 * @property {WebComponent|function(): Promise<WebComponent>} [component]
 * @property {Record<string,WebComponent|function(): Promise<WebComponent>>} [components]
 * @property {Record<string,RouteRecordProps>|boolean} [props] - Die Properties für die Route
 */

/**
 * Optionen für das Weiterleiten einer Route.
 * @typedef {RouteLocationRaw|function(to: RouteLocation): RouteLocationRaw} RouteRecordRedirectOption
 */

/**
 * Die Properties für die Route
 * @typedef {boolean|Record<string, *>|(function(to: RouteLocationNormalized): Record<string, *>)} RouteRecordProps
 */

/**
 * Der Name einer Route.
 * @typedef {string|Symbol} RouteRecordName
 */

/**
 * Die Ziel-Location.
 * @typedef {Object} MatcherLocationRaw
 * @property {string} [name] - Der Ziel-Name
 * @property {string} [path] - Der Ziel-Pfad
 * @property {Object} [params] - Die Parameter für das Ziel
 * @property {Object} [query] - Die Query-Daten für das Ziel
 */

/**
 * Die Location.
 * @typedef {Object} MatcherLocation
 * @property {RouteRecordName} name - Der Name der Location
 * @property {string} path - Der Pfad der Location
 * @property {RouteParams} params - Die Parameter der Location
 * @property {RouteMeta} meta - Die Meta-Daten der Location
 * @property {RouteRecord} matched - Die Einträge der Route
 */

/**
 * Der Matcher für die Location mit den Routen.
 * @class
 */
export class RouterMatcher {
    /**
     * Nach Priorität sortierte Record-Matcher.
     * @type {RouteRecordMatcher[]}
     */
    #matchers = [];
    /**
     * Eine Map mit Matchern sortiert nach den Routen-Namen.
     * @type {Map<string, RouteRecordMatcher>}
     */
    #matcherMap = new Map();
    /**
     * Die Pfad-Optionen.
     * @type {PathOptions}
     */
    #options;

    /**
     * Der Konstruktor für den Matcher.
     * @param {RouteRecordRaw[]} routes - Die Routen
     * @param {PathOptions} options - Die Optionen für den Matcher
     */
    constructor(routes, options) {
        this.#options = mergeOptions({
            strict: false,
            end: true,
            sensitive: false
        }, options);

        routes.forEach(route => this.addRoute(route));
    }

    /**
     * Gibt den Matcher für eine Route zurück
     * @param {RouteRecordName} name
     * @returns {RouteRecordMatcher}
     */
    getRecordMatcher(name) {
        return this.#matcherMap.get(name);
    }

    /**
     * Fügt eine neue Route hinzu.
     * @param {RouteRecordRaw} record
     * @param {RouteRecordMatcher} [parent]
     * @param {RouteRecordMatcher} [originalRecord]
     */
    addRoute(record, parent, originalRecord) {
        const isRootAdd = !originalRecord;

        const mainNormalizedRecord = new RouteRecord(record);
        mainNormalizedRecord.aliasOf = originalRecord?.record;

        const options = mergeOptions(this.#options, record);
        const normalizedRecords = [
            mainNormalizedRecord
        ];

        if ("alias" in record) {
            const aliases = typeof record.alias === "string" ? [record.alias] : record.alias;

            for (const alias of aliases) {
                normalizedRecords.push(assign(Object.create(mainNormalizedRecord), {
                    components: originalRecord
                        ? originalRecord.record.components
                        : mainNormalizedRecord.components,
                    path: alias,
                    aliasOf: originalRecord
                        ? originalRecord.record
                        : mainNormalizedRecord,
                }));
            }
        }

        let matcher;
        let originalMatcher;

        for (const normalizedRecord of normalizedRecords) {
            const { path } = normalizedRecord;

            if (parent && path[0] !== "/") {
                const parentPath = parent.record.path;

                const connectingSlash = parentPath[parentPath.length - 1] === "/" ? "" : "/";
                normalizedRecord.path = parent.record.path + (path && connectingSlash + path);
            }

            matcher = new RouteRecordMatcher(normalizedRecord, parent, options);

            if (originalRecord) {
                originalRecord.alias.push(matcher);
            } else {
                originalMatcher = originalMatcher || matcher;

                if (originalMatcher !== matcher) {
                    originalMatcher.alias.push(matcher);
                }

                if (isRootAdd && record.name && !isAliasRecord(matcher)) {
                    this.removeRoute(record.name);
                }
            }

            if ("children" in mainNormalizedRecord) {
                const children = mainNormalizedRecord.children;

                for (let i = 0; i < children.length; i++) {
                    this.addRoute(children[i], matcher, originalRecord?.children[i]);
                }
            }

            originalRecord = originalRecord || matcher;

            this.insertMatcher(matcher);
        }

        return originalMatcher
            ? () => {
                this.removeRoute(originalMatcher);
            }
            : NOOP;
    }

    /**
     * Entfernt eine Route.
     * @param {RouteRecordName|RouteRecordMatcher} matcherRef
     */
    removeRoute(matcherRef) {
        if (isRouteName(matcherRef)) {
            const matcher = this.#matcherMap.get(matcherRef);

            if (matcher) {
                this.#matcherMap.delete(matcherRef);
                this.#matchers.splice(this.#matchers.indexOf(matcher), 1);
                matcher.children.forEach(child => this.removeRoute(child));
                matcher.alias.forEach(matcher => this.removeRoute(matcher));
            }
        } else {
            const index = this.#matchers.indexOf(matcherRef);

            if (index > -1) {
                this.#matchers.splice(index, 1);

                if (matcherRef.record.name) {
                    this.#matcherMap.delete(matcherRef.record.name);
                }

                matcherRef.children.forEach(child => this.removeRoute(child));
                matcherRef.alias.forEach(matcher => this.removeRoute(matcher));
            }
        }
    }

    /**
     * Gibt alle Routen zurück.
     * @returns {RouteRecordMatcher[]}
     */
    getRoutes() {
        return this.#matchers;
    }

    /**
     *
     * @param {RouteRecordMatcher} matcher
     */
    insertMatcher(matcher) {
        let i = 0;
        let iMatcher = this.#matchers[i];

        while (
            iMatcher &&
            comparePathScore(matcher, iMatcher) >= 0 &&
            (matcher.record.path !== iMatcher.record.path || !isRecordChildOf(matcher, iMatcher))
        ) {
            i++;
            this.#matchers.splice(i, 0, matcher);

            if (matcher.record.name && !isAliasRecord(matcher)) {
                this.#matcherMap.set(matcher.record.name, matcher);
            }

            iMatcher = this.#matchers[i];
        }
    }

    /**
     *
     * @param {MatcherLocationRaw} location
     * @param {MatcherLocation} currentLocation
     * @returns {MatcherLocation}
     */
    resolve(location, currentLocation) {
        let matcher;
        let params = {};
        let path;
        let name;

        if ("name" in location && location.name) {
            matcher = this.#matcherMap.get(location.name);

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
            matcher = this.#matchers.find(m => m.test(path));

            if (matcher) {
                params = matcher.parse(path);
                name = matcher.record.name;
            }
        } else {
            matcher = currentLocation.name
                ? this.#matcherMap.get(currentLocation.name)
                : this.#matchers.find(m => m.test(currentLocation.path));

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

        const matched = [];
        let parentMatcher = matcher;

        while (parentMatcher) {
            matched.unshift(parentMatcher.record);
            parentMatcher = parentMatcher.parent;
        }

        return {
            name,
            path,
            params,
            matched,
            meta: mergeMetaFields(matched)
        };
    }
}

/**
 * Gibt nur die Parameter zurück, deren Schlüssel übergeben wurden.
 * @param {RouteParams} params - Die Parameter
 * @param {string[]} keys - Die Schlüssel der Parameter
 * @returns {RouteParams} Nur die Parameter, deren Schlüssel übergeben wurden
 */
function paramsFromLocation(params, keys) {
    const newParams = {};

    for (const key of keys) {
        if (key in params) {
            newParams[key] = params[key];
        }
    }

    return newParams;
}


/**
 * Verbindet alle Meta-Daten der Router-Einträge.
 * @param {RouteRecord[]} matched - Die Router-Einträge
 * @returns {Object}
 */
function mergeMetaFields(matched) {
    return matched.reduce((meta, record) => assign(meta, record.meta), {});
}

/**
 * Gist nur die Optionen zurück, die in den Defaults definiert sind.
 * @template T
 * @param {T} defaults - Die Default-Optionen
 * @param {Partial<T>} partialOptions - Die Optionen
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
 * Prüft, ob es sich um einen Routen-Namen handelt.
 * @param {*} name - Der zu prüfende Name
 * @returns {boolean} Wahr, wenn es sich um einen Routen-Namen handelt
 */
function isRouteName(name) {
    return typeof name === "string" || typeof name === "symbol";
}

/**
 * Gibt den original Pfad zurück.
 * @param {RouteRecord} record - Der Router-Eintrag
 * @return {string} Der original Pfad
 */
export function getOriginalPath(record) {
    return record
        ? (record.aliasOf
            ? record.aliasOf.path
            : record.path)
        : "";
}
