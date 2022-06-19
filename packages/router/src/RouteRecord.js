
/**
 * Der Eintrag der Route.
 * @class
 */
export class RouteRecord {
    /**
     * Der Name der Route.
     * @type {RouteRecordName}
     */
    name;
    /**
     * Der Pfad der Route.
     * @type {string}
     */
    path;
    /**
     * Weiterleitung zu einer anderen Route.
     * @type {RouteRecordRedirectOption}
     */
    redirect;
    /**
     * Die tatsächliche Route, wenn diese Route nur eine Alternative Route ist.
     * @type {RouteRecord}
     */
    aliasOf;
    /**
     * Die Properties der Route.
     * @type {RouteRecordProps}
     */
    props;
    /**
     * Metadaten der Route.
     * @type {RouteMeta}
     */
    meta;
    /**
     * Die Komponenten der Route.
     * @type {Record<string, WebComponent|function(): Promise<WebComponent>>}
     */
    components;
    /**
     * Wächter, der/die vor dem tatsächlichen Wechsel aufgerufen werden.
     * @type {NavigationGuard|NavigationGuard[]}
     */
    beforeEnter;
    /**
     * Die Instanzen der Komponenten.
     * @type {Record<string, WebComponent>}
     */
    instances = {};
    /**
     * Wächter, der/die beim Verlassen der Route aufgerufen werden.
     * @type {Set<NavigationGuard>}
     */
    leaveGuards = new Set();
    /**
     * Wächter, der/die beim Verlassen der Route aufgerufen werden.
     * @type {Set<NavigationGuard>}
     */
    updateGuards = new Set();
    /**
     * Callbacks die aufgerufen werden, wenn die Route aufgerufen wurde.
     * @type {Record<string, NavigationGuardNextCallback[]>}
     */
    enterCallbacks = {};

    /**
     * Der Konstruktor für einen Routen-Eintrag.
     * @param {RouteRecordRaw} record
     */
    constructor(record) {
        this.path = record.path;
        this.redirect = record.redirect;
        this.name = record.name;
        this.meta = record.meta || {};
        this.beforeEnter = record.beforeEnter;
        this.props = normalizeRecordProps(record);
        this.children = record.children || [];

        this.components = "components" in record
            ? record.components || {}
            : { default: record.component };
    }
}

/**
 * Normalisiert die Properties für die Komponenten.
 * @param {RouteRecordRaw} record
 */
function normalizeRecordProps(record) {
    const propsObject = {};

    const props = record.props || false;

    if ("component" in record) {
        propsObject.default = props;
    } else {
        for (const name in record.components) {
            propsObject[name] = typeof props === "boolean" ? props : props[name];
        }
    }

    return propsObject;
}

/**
 * Handelt es sich um denselben Eintrag im Router.
 * @param {RouteRecord} a - Der erste Router-Eintrag
 * @param {RouteRecord} b - Der zweite Router-Eintrag
 * @returns {boolean} Wahr, wenn sie gleich, bzw. einer oder beide Alias des selben Eintrags sind
 */
export function isSameRouteRecord(a, b) {
    return (a.aliasOf || a) === (b.aliasOf || b);
}
