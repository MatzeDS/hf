import { NOOP, assign } from "../../shared/index.js";
import { shallowRef } from "../../reactivity/index.js";
import { parseURI, stringifyURI } from "./uri.js";
import { normalizeQuery, stringifyQuery } from "./query.js";
import { decode, decodeParams, encodeHash, encodeParams } from "./encoding.js";
import { createRouterError, ErrorTypes, isNavigationFailure } from "./errors.js";
import { extractComponentGuards, guardToPromiseFn } from "./guards.js";
import { RouterMatcher } from "./RouterMatcher.js";
import { WebHistory, NavigationType } from "./WebHistory.js";
import { isSameRouteRecord } from "./RouteRecord.js";

/**
 *
 * @typedef {Record<string,string|number|(string|number)[]>} RouteParamsRaw
 */

/**
 *
 * @typedef {Record<string, string|string[]>} RouteParams
 */

/**
 *
 * @typedef {Object} RouteLocationOptions
 * @property {boolean} [replace]
 * @property {HistoryState} [state]
 */

/**
 *
 * @typedef {string|{ name: RouteRecordName, [params]: RouteParamsRaw, [path]: string, [query]: LocationQueryRaw, [hash]: string }} RouteLocationRaw
 */

/**
 * Die Optionen für den Router.
 * @typedef {Object} RouterOptions
 * @property {RouteRecordRaw[]} routes - Die Routen für den Router
 * @property {string} base - Der Basispfad
 * @property {string} [linkActiveClass] - Die Klasse, wenn der Link dem aktuellen Pfad entspricht
 * @property {string} [linkExactActiveClass] - Die Klasse, wenn der exakte Link dem aktuellen Pfad entspricht
 * @property {boolean} [strict=false] - Einen abschließenden Slash nicht zulassen
 * @property {boolean} [end=false] - Sollen die RegExp bis zum Ende passen und mit einem "$" abschließen
 * @property {boolean} [sensitive=false] - Macht die RegExp case sensitive
 */

/**
 * Die Meta-Daten für die Route.
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
 *
 * @typedef {RouteLocation} RouteLocationNormalized
 */

/**
 * Die aktuelle Router-Instance.
 * @type {Router}
 */
export let currentInstance = null;

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
 * @class
 */
class Router {
    /**
     * Ist der Router bereit?
     * @type {boolean}
     */
    #ready = false;
    /**
     * Die Optionen des Routers.
     * @type {RouterOptions}
     */
    #options;
    /**
     * Der Router-Matcher.
     * @type {RouterMatcher}
     */
    #matcher;
    /**
     * Die Web-History.
     * @type {WebHistory}
     */
    #routerHistory;
    /**
     * Die ausstehende Location.
     * @type {RouteLocationNormalized}
     */
    #pendingLocation;
    /**
     * Wächter, der vor jedem Seitenwechsel aufgerufen werden.
     * @type {Set<NavigationGuard>}
     */
    #beforeGuards = new Set();
    /**
     * Wächter, der vor dem endgültigen Seitenwechsel aufgerufen werden.
     * @type {Set<NavigationGuard>}
     */
    #beforeResolveGuards = new Set();
    /**
     * Wächter, die nach der Navigation aufgerufen werden.
     * @type {Set<function(to: RouteLocationNormalized, from: RouteLocationNormalized, failure: NavigationError): void>}
     */
    #afterGuards = new Set();
    /**
     * Wenn der Router bereit ist, werden die Handler aufgerufen.
     * @type {Set<function(error?: *): void>}
     */
    #readyHandlers = new Set();
    /**
     * Die registrierten Error-Handler.
     * @type {Set<function(error: *, to: RouteLocationNormalized, from: RouteLocationNormalized): void>}
     */
    #errorHandlers = new Set();
    /**
     * Die Aktuelle Route.
     * @type {Reference<RouteLocationNormalized>}
     */
    currentRoute;

    /**
     * Die Optionen des Routers.
     * @returns {RouterOptions}
     */
    get options() {
        return this.#options;
    }

    /**
     * Der Konstruktor für den Router.
     * @param {RouterOptions} options - Die Optionen des Routers
     */
    constructor(options) {
        this.#options = options;
        this.#matcher = new RouterMatcher(options.routes, options);
        this.#routerHistory = new WebHistory(options.base);
        this.#pendingLocation = START_LOCATION_NORMALIZED;
        this.currentRoute = shallowRef(START_LOCATION_NORMALIZED);
    }

    /**
     * Fügt eine neue Route dem Router hinzu.
     * @param {RouteRecordRaw} route - Die neue Route
     * @param {RouteRecordName} [parent] - Der Elternpfad
     */
    addRoute(route, parent) {
        const parentMatcher = this.#matcher.getRecordMatcher(parent);

        return this.#matcher.addRoute(route, parentMatcher);
    }

    /**
     * Entfernt eine Route vom Router.
     * @param {RouteRecordName} name - Der Name der Route
     */
    removeRoute(name) {
        const recordMatcher = this.#matcher.getRecordMatcher(name);

        if (recordMatcher) {
            this.#matcher.removeRoute(recordMatcher);
        }
    }

    /**
     * Gibt die Routen des Routers zurück.
     * @returns {RouteRecord[]} Die Liste aller Routen
     */
    getRoutes() {
        return this.#matcher.getRoutes().map(routeMatcher => routeMatcher.record);
    }

    /**
     * Gibt es eine Route mit dem Namen.
     * @param {RouteRecordName} name - Der Name der Route
     * @returns {boolean} Wahr, wenn es eine Route mit dem Namen gibt.
     */
    hasRoute(name) {
        return !!this.#matcher.getRecordMatcher(name);
    }

    /**
     * Löst die Location auf, um Route-Location zurück zu geben.
     * @param {RouteLocationRaw} rawLocation
     * @param {RouteLocationNormalized} [currentLocation]
     * @returns {RouteLocation & { href: string }}
     */
    resolve(rawLocation, currentLocation) {
        const routeLocation = assign({}, currentLocation || this.currentRoute.value);

        if (typeof rawLocation === "string") {
            const locationNormalized = parseURI(rawLocation, routeLocation.path);
            const matchedRoute = this.#matcher.resolve(
                { path: locationNormalized.path },
                routeLocation
            );

            const href = this.#routerHistory.createHref(locationNormalized.fullPath);

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
            const targetParams = assign({}, rawLocation.params);

            for (const key in targetParams) {
                if (targetParams[key] == null) {
                    delete targetParams[key];
                }
            }

            matcherLocation = assign({}, rawLocation, {
                params: encodeParams(rawLocation.params)
            });

            routeLocation.params = encodeParams(routeLocation.params);
        }

        const matchedRoute = this.#matcher.resolve(matcherLocation, routeLocation);
        const hash = rawLocation.hash || "";

        matchedRoute.params = decodeParams(matchedRoute.params);

        const fullPath = stringifyURI(
            assign({}, rawLocation, {
                hash: encodeHash(hash),
                path: matchedRoute.path,
            })
        );

        const href = this.#routerHistory.createHref(fullPath);

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
     * Gibt die Location als Objekt zurück.
     * @param {RouteLocationRaw|RouteLocationNormalized} to - Die Location
     * @returns {Exclude<RouteLocationRaw, string>|RouteLocationNormalized} Die Location als Objekt
     */
    #locationAsObject(to) {
        return typeof to === "string"
            ? parseURI(to, this.currentRoute.value.path)
            : assign({}, to);
    }

    /**
     * Prüft, ob die Navigation abgebrochen wurde und wirft einen Fehler falls dass der Fall ist.
     * @param {RouteLocationNormalized} to - Die Ziel-Location
     * @param {RouteLocationNormalized} from - Die Quell-Location
     * @returns {NavigationError|void} Der Fehler, falls die Navigation abgebrochen wurde
     */
    #checkCanceledNavigation(to, from) {
        if (this.#pendingLocation !== to) {
            return createRouterError(ErrorTypes.NAVIGATION_CANCELLED, {
                from,
                to
            });
        }
    }

    /**
     * Stößt ein neues Ziel für den Router an.
     * @param {RouteLocationRaw} to - Die Ziel-Location
     * @returns {Promise<NavigationError|void|undefined>} Das Promise, liefert das Ergebnis der Navigation
     */
    push(to) {
        return this.#pushWithRedirect(to);
    }

    /**
     * Stößt ein neues Ziel für den Router an, dabei wird der History Eintrag überschrieben.
     * @param {RouteLocationRaw} to - Die Ziel-Location
     * @returns {Promise<NavigationError|void|undefined>} Das Promise, liefert das Ergebnis der Navigation
     */
    replace(to) {
        return this.push(assign(this.#locationAsObject(to), { replace: true }));
    }

    /**
     * Behandelt die Weiterleitung der Route. Falls diese eingerichtet ist, wird das neue Ziel zurück gegeben.
     * @param {RouteLocation} to - Die Ziel-Location
     * @returns {RouteLocationRaw|void} Das neue Ziel, falls eine Weiterleitung eingerichtet wurde
     */
    #handleRedirectRecord(to) {
        const lastMatched = to.matched[to.matched.length - 1];

        if (lastMatched && lastMatched.redirect) {
            const { redirect } = lastMatched;
            let newTargetLocation = typeof redirect === "function" ? redirect(to) : redirect;

            if (typeof newTargetLocation === "string") {
                newTargetLocation = newTargetLocation.includes("?") || newTargetLocation.includes("#")
                    ? this.#locationAsObject(newTargetLocation)
                    : { path: newTargetLocation };

                newTargetLocation.params = {};
            }

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
     * Stößt ein neues Ziel für den Router an.
     * @param {RouteLocationRaw|RouteLocation|RouteLocationOptions} to - Die Ziel-Location
     * @param {RouteLocation} [redirectedFrom] - Wurde weitergeleitet von
     * @returns {Promise<NavigationError|void|undefined>} Das Promise, liefert das Ergebnis der Navigation
     */
    #pushWithRedirect(to, redirectedFrom) {
        const targetLocation = this.#pendingLocation = this.resolve(to);
        const from = this.currentRoute.value;
        const data = to.state;
        const replace = to.replace === true;
        const shouldRedirect = this.#handleRedirectRecord(targetLocation);

        if (shouldRedirect) {
            return this.#pushWithRedirect(
                assign(this.#locationAsObject(shouldRedirect), { state: data, replace }),
                redirectedFrom || targetLocation
            );
        }

        const toLocation = targetLocation;

        toLocation.redirectedFrom = redirectedFrom;
        let failure;

        if (isSameRouteLocation(from, targetLocation)) {
            failure = createRouterError(ErrorTypes.NAVIGATION_DUPLICATED, { to: toLocation, from });
        }

        return failure
            ? Promise.resolve(failure)
            : this.#navigate(toLocation, from)
                .catch(error => isNavigationFailure(error)
                    ? isNavigationFailure(error, ErrorTypes.NAVIGATION_GUARD_REDIRECT)
                        ? error
                        : this.#markAsReady(error)
                    : this.#triggerError(error, toLocation, from)
                )
                .then(error => {
                    let failure = error;

                    if (failure) {
                        if (isNavigationFailure(failure, ErrorTypes.NAVIGATION_GUARD_REDIRECT)) {
                            return this.#pushWithRedirect(
                                assign(this.#locationAsObject(failure.to), {
                                    state: data,
                                    replace,
                                }),
                                redirectedFrom || toLocation
                            );
                        }
                    } else {
                        failure = this.#finalizeNavigation(
                            toLocation,
                            from,
                            true,
                            replace,
                            data
                        );
                    }

                    this.#triggerAfterEach(
                        toLocation,
                        from,
                        failure
                    );

                    return failure;
                });
    }

    /**
     * Erzeugt ein Promise, welches rejected wird, wenn die Navigation abgebrochen wurde.
     * Andernfalls wird der Promise resolved.
     * @param {RouteLocationNormalized} to - Die Ziel-Location
     * @param {RouteLocationNormalized} from - Die Quell-Location
     * @returns {Error|Promise<*>}
     */
    #checkCanceledNavigationAndReject(to, from) {
        const error = this.#checkCanceledNavigation(to, from);

        return error ? Promise.reject(error) : Promise.resolve();
    }

    /**
     * Navigiert von der Alten Location zur neuen, idem der komplette Lifecycle durchlaufen wird.
     * @param {RouteLocationNormalized} to - Die Ziel-Location
     * @param {RouteLocationNormalized} from - Die Quell-Location
     * @returns {Promise}
     */
    #navigate(to, from) {
        const {
            leavingRecords,
            updatingRecords,
            enteringRecords
        } = extractChangingRecords(to, from);

        let guards = extractComponentGuards(
            leavingRecords.reverse(),
            "beforeRouteLeave",
            to,
            from
        );

        for (const record of leavingRecords) {
            record.leaveGuards.forEach(guard => guards.push(guardToPromiseFn(guard, to, from)));
        }

        const canceledNavigationCheck = this.#checkCanceledNavigationAndReject.bind(
            null,
            to,
            from
        );

        guards.push(canceledNavigationCheck);

        return (
            runGuardQueue(guards)
                .then(() => {
                    guards = [];

                    this.#beforeGuards.forEach(guard => {
                        guards.push(guardToPromiseFn(guard, to, from));
                    });

                    guards.push(canceledNavigationCheck);

                    return runGuardQueue(guards);
                })
                .then(() => {
                    guards = extractComponentGuards(updatingRecords, "beforeRouteUpdate", to, from);

                    for (const record of updatingRecords) {
                        record.updateGuards.forEach(guard => guards.push(guardToPromiseFn(guard, to, from)));
                    }

                    guards.push(canceledNavigationCheck);

                    return runGuardQueue(guards);
                })
                .then(() => {
                    guards = [];

                    for (const record of to.matched) {
                        if (record.beforeEnter && !from.matched.includes(record)) {
                            if (Array.isArray(record.beforeEnter)) {
                                for (const beforeEnter of record.beforeEnter) {
                                    guards.push(guardToPromiseFn(beforeEnter, to, from));
                                }
                            } else {
                                guards.push(guardToPromiseFn(record.beforeEnter, to, from));
                            }
                        }
                    }

                    guards.push(canceledNavigationCheck);

                    return runGuardQueue(guards);
                })
                .then(() => {
                    to.matched.forEach(record => (record.enterCallbacks = {}));

                    guards = extractComponentGuards(
                        enteringRecords,
                        "beforeRouteEnter",
                        to,
                        from
                    );

                    guards.push(canceledNavigationCheck);

                    return runGuardQueue(guards);
                })
                .then(() => {
                    guards = [];

                    this.#beforeResolveGuards.forEach(guard => {
                        guards.push(guardToPromiseFn(guard, to, from));
                    });

                    guards.push(canceledNavigationCheck);

                    return runGuardQueue(guards);
                })
                .catch(err => isNavigationFailure(err, ErrorTypes.NAVIGATION_CANCELLED)
                    ? err
                    : Promise.reject(err)
                )
        );
    }

    /**
     * Löst alle Wächter aus, die nach dem Beenden einer Navigation registriert sind.
     * @param {RouteLocationNormalized} to - Die Ziel-Location
     * @param {RouteLocationNormalized} from - Die Quell-Location
     * @param {NavigationError} [failure] - Ein Fehler
     */
    #triggerAfterEach(to, from, failure) {
        this.#afterGuards.forEach(guard => {
            guard(to, from, failure);
        });
    }

    /**
     * Beendet die Navigation, wenn es keinen Fehler, wird die neue Route als aktuelle gespeichert.
     * Es kann auch ein Historyeintrag erstellt/ersetzt werden.
     * @param {RouteLocationNormalized} toLocation - Die Ziel-Location
     * @param {RouteLocationNormalized} from - Die Quell-Location
     * @param {boolean} isPush - Soll ein History eintrag erstellt werden
     * @param {boolean} [replace] - Ersetzt den aktuellen Historyeintrag
     * @param {HistoryState} [data] - Die State-Daten
     * @returns {NavigationError|void} Falls es einen Fehler gab, wird dieser zurück gegeben
     */
    #finalizeNavigation(toLocation, from, isPush, replace, data) {
        const error = this.#checkCanceledNavigation(toLocation, from);

        if (error) {
            return error;
        }

        const isFirstNavigation = from === START_LOCATION_NORMALIZED;

        if (isPush) {
            if (replace || isFirstNavigation) {
                this.#routerHistory.replace(toLocation.fullPath, data);
            } else {
                this.#routerHistory.push(toLocation.fullPath, data);
            }
        }

        this.currentRoute.value = toLocation;

        this.#markAsReady();
    }

    /**
     * Initialisiert den Router.
     */
    #setupListeners() {
        this.#routerHistory.listen((to, _from, info) => {
            const toLocation = this.resolve(to);
            const shouldRedirect = this.#handleRedirectRecord(toLocation);

            if (shouldRedirect) {
                this.#pushWithRedirect(
                    assign(shouldRedirect, { replace: true }),
                    toLocation
                ).catch(NOOP);

                return;
            }

            this.#pendingLocation = toLocation;
            const from = this.currentRoute.value;

            this.#navigate(toLocation, from)
                .catch(error => {
                    if (isNavigationFailure(error, ErrorTypes.NAVIGATION_ABORTED | ErrorTypes.NAVIGATION_CANCELLED)) {
                        return error;
                    }

                    if (isNavigationFailure(error, ErrorTypes.NAVIGATION_GUARD_REDIRECT)) {
                        this.#pushWithRedirect(error.to, toLocation).then(failure => {
                            if (isNavigationFailure(failure, ErrorTypes.NAVIGATION_ABORTED | ErrorTypes.NAVIGATION_DUPLICATED) &&
                                !info.delta &&
                                info.type === NavigationType.pop
                            ) {
                                this.#routerHistory.go(-1, false);
                            }
                        }).catch(NOOP);

                        return Promise.reject();
                    }

                    if (info.delta) {
                        this.#routerHistory.go(-info.delta, false);
                    }

                    return this.#triggerError(error, toLocation, from);
                })
                .then(error => {
                    const failure = error || this.#finalizeNavigation(toLocation, from, false);

                    if (failure) {
                        if (info.delta) {
                            this.#routerHistory.go(-info.delta, false);
                        } else if (
                            info.type === NavigationType.pop &&
                            isNavigationFailure(failure, ErrorTypes.NAVIGATION_ABORTED | ErrorTypes.NAVIGATION_DUPLICATED)
                        ) {
                            this.#routerHistory.go(-1, false);
                        }
                    }

                    this.#triggerAfterEach(toLocation, from, failure);
                })
                .catch(NOOP);
        });
    }

    /**
     * Teilt einen Fehler an alle Registrierten Error-Handler mit.
     * @param {*} error - Der Fehler
     * @param {RouteLocationNormalized} to - Die Ziel-Location
     * @param {RouteLocationNormalized} from - Die Quell-Location
     * @returns {Promise} Der erzeugte reject Promise
     */
    #triggerError(error, to, from) {
        this.#markAsReady(error);
        this.#errorHandlers.forEach(handler => handler(error, to, from));

        return Promise.reject(error);
    }

    /**
     * Liefert ein Promise, welches Aufgelöst wird, sobald der Router bereit ist.
     * @returns {Promise<void>} Der Promise
     */
    isReady() {
        if (this.#ready && this.currentRoute.value !== START_LOCATION_NORMALIZED) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            this.#readyHandlers.add((err) => (err ? reject(err) : resolve()));
        });
    }

    /**
     * Markiert den Router als bereit.
     * @param {*} [err] - Ein möglicher Fehler
     */
    #markAsReady(err) {
        if (this.#ready) {
            return;
        }

        this.#ready = true;
        this.#setupListeners();
        this.#readyHandlers.forEach(handler => handler(err));
        this.#readyHandlers.clear();
    }

    /**
     * Geht in der History, vor oder zurück.
     * @param {number} delta - Die Anzahl an Einträgen, Positiv = Vorwärts, Negativ = Rückwärts
     */
    go(delta) {
        this.#routerHistory.go(delta);
    }

    /**
     * Geht einen Eintrag zurück in der History.
     */
    back() {
        this.go(-1);
    }

    /**
     * Geht einen Eintrag vorwärts in der History.
     */
    forward() {
        this.go(1);
    }

    /**
     * Registriert einen Handler, der bei einem Fehler aufgerufen wird.
     * @param {function(error: *, to: RouteLocationNormalized, from: RouteLocationNormalized): void} handler - Der Handler
     */
    onError(handler) {
        return addWithRemover(this.#errorHandlers, handler);
    }

    /**
     * Registriert einen Wächter, der vor jedem Seitenwechsel aufgerufen wird.
     * @param {NavigationGuard} handler - Der Wächter
     */
    beforeEach(handler) {
        return addWithRemover(this.#beforeGuards, handler);
    }

    /**
     * Registriert einen Wächter, der vor dem endgültigen Seitenwechsel aufgerufen wird.
     * @param {NavigationGuard} handler - Der Wächter
     */
    beforeResolve(handler) {
        return addWithRemover(this.#beforeResolveGuards, handler);
    }

    /**
     * Registriert einen Handler, der nach jeder Navigation aufgerufen wird.
     * @param {function(to: RouteLocationNormalized, from: RouteLocationNormalized, failure: NavigationError): void} handler - Der Handler
     */
    afterEach(handler) {
        return addWithRemover(this.#afterGuards, handler);
    }
}

/**
 * Erzeugt einen neuen Router.
 * @param {RouterOptions} options - Die Optionen für den Router
 * @returns {Router} Der neue Router
 */
export function createRouter(options) {
    if (currentInstance) {
        throw new Error("A router already exists.");
    }

    return (currentInstance = new Router(options));
}

/**
 * Fügt der Collection einen neuen Wert hinzu und
 * liefert eine Funktion um diesen Wert wieder zu entfernen.
 * @param {Set} collection - Die Collection
 * @param {*} value -  Der Wert
 * @return {function(): void} Eine Funktion zum Entfernen des Werts
 */
function addWithRemover(collection, value) {
    collection.add(value);

    return () => collection.delete(value);
}

/**
 * Ausführen der Wächter.
 * @param {NavigationGuard[]} guards - Die Wächter
 * @returns {Promise<void>}
 */
function runGuardQueue(guards) {
    return guards.reduce(
        (promise, guard) => promise.then(() => guard()),
        Promise.resolve()
    );
}

/**
 * Gibt die Unterschiede zwischen den Router-Einträgen zurück.
 * @param {RouteLocationNormalized} to - Die Ziel-Location
 * @param {RouteLocationNormalized} from - Die Quell-Location
 * @returns {{leavingRecords: RouteRecord[], updatingRecords: RouteRecord[], enteringRecords: RouteRecord[]}}
 */
function extractChangingRecords(to, from) {
    const leavingRecords = [];
    const updatingRecords = [];
    const enteringRecords = [];

    const len = Math.max(from.matched.length, to.matched.length);

    for (let i = 0; i < len; i++) {
        const recordFrom = from.matched[i];

        if (recordFrom) {
            if (to.matched.find(record => isSameRouteRecord(record, recordFrom))) {
                updatingRecords.push(recordFrom);
            } else {
                leavingRecords.push(recordFrom);
            }
        }

        const recordTo = to.matched[i];

        if (recordTo) {
            if (!from.matched.find(record => isSameRouteRecord(record, recordTo))) {
                enteringRecords.push(recordTo);
            }
        }
    }

    return {
        leavingRecords,
        updatingRecords,
        enteringRecords
    };
}

/**
 * Prüft, ob die Parameter übereinstimmen.
 * @param {RouteParams} a - Die ersten Parameter
 * @param {RouteParams} b - Die zweiten Parameter
 * @returns {boolean} Wahr, wenn alle Parameter übereinstimmen
 */
export function isSameRouteLocationParams(a, b) {
    if (Object.keys(a).length !== Object.keys(b).length) {
        return false;
    }

    for (const key in a) {
        if (!isSameRouteLocationParamsValue(a[key], b[key])) {
            return false;
        }
    }

    return true;
}

/**
 * Prüft, ob die Werte zueinander passen.
 * Wenn beides Arrays sind, müssen alle Werte übereinstimmen.
 * Falls b, kein Array ist, muss a nur einen Wert haben, der mit b übereinstimmt.
 * @param {string[]} a - Die ersten Werte
 * @param {string|string[]} b - Die zweiten Werte bzw. Wert
 * @return {boolean} Wahr, wenn die Werte Äquivalent sind
 */
function isEquivalentArray(a, b) {
    return Array.isArray(b)
        ? a.length === b.length && a.every((value, i) => value === b[i])
        : a.length === 1 && a[0] === b;
}

/**
 * Prüft, ob die Werte zweier Parameter gleich sind.
 * @param {string|string[]} a - Der Wert des ersten Parameters
 * @param {string|string[]} b - Der Wert des zweiten Parameters
 * @return {boolean} Wahr, wenn die Werte der Parameter gleich sind
 */
function isSameRouteLocationParamsValue(a, b) {
    return Array.isArray(a)
        ? isEquivalentArray(a, b)
        : Array.isArray(b)
            ? isEquivalentArray(b, a)
            : a === b;
}

/**
 * Prüft, ob zwei Locations gleich sind.
 * @param {RouteLocation} a - Die erste Location
 * @param {RouteLocation} b - Die zweite Location
 * @returns {boolean} Wahr, wenn die Locations gleich sind
 */
export function isSameRouteLocation(a, b) {
    const aLastIndex = a.matched.length - 1;
    const bLastIndex = b.matched.length - 1;

    return (
        aLastIndex > -1 &&
        aLastIndex === bLastIndex &&
        isSameRouteRecord(a.matched[aLastIndex], b.matched[bLastIndex]) &&
        isSameRouteLocationParams(a.params, b.params) &&
        stringifyQuery(a.query) === stringifyQuery(b.query) &&
        a.hash === b.hash
    );
}
