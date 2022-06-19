export const EMPTY_OBJ = {};
export const EMPTY_ARR = [];

/**
 * Die Funktion macht nichts.
 * @type {function(): void}
 */
export const NOOP = () => {};

/**
 * Die Funktion liefert immer false zurück.
 * @type {function(): boolean}
 */
export const NO = () => false;

/**
 * Die Funktion kopiert allen Properties, von den Quellen zum Ziel.
 * @type {function(target: Object, ...source: Object): Object}
 */
export const assign = Object.assign;

/**
 * Prüft, ob der übergebene Wert ein Array ist.
 * @type {function(value: *): value is Array}
 */
export const isArray = Array.isArray;

/**
 * Prüft, ob der übergebene Wert eine Map ist.
 * @type {function(value: *): value is Map}
 */
export const isMap = (value) => toTypeString(value) === "[object Map]";

/**
 * Prüft, ob der übergebene Wert eine Map ist.
 * @type {function(value: *): value is Set}
 */
export const isSet = (value) => toTypeString(value) === "[object Set]";

/**
 * Prüft, ob der übergebene Wert ein einfaches Objekt ist.
 * @type {function(value: *): value is Object}
 */
export const isPlainObject = (value) => toTypeString(value) === "[object Object]";

/**
 * Prüft, ob der übergebene Wert eine Funktion ist.
 * @type {function(value: *): value is Function}
 */
export const isFunction = (value) => typeof value === "function";

/**
 * Prüft, ob der übergebene Wert ein String ist.
 * @type {function(value: *): value is string}
 */
export const isString = (value) => typeof value === "string";

/**
 * Prüft, ob der übergebene Wert ein Symbol ist.
 * @type {function(value: *): value is Symbol}
 */
export const isSymbol = (value) => typeof value === "symbol";

/**
 * Prüft, ob der übergebene Wert ein Objekt ist.
 * @type {function(value: *): value is Object}
 */
export const isObject = (value) => value != null && typeof value === "object";

/**
 * Prüft, ob der übergebene Wert ein Promise ist.
 * @type {function(value: *): value is Promise}
 */
export const isPromise = (value) => value && typeof value.then === "function";

export const objectToString = Object.prototype.toString;
export const toTypeString = (value) => objectToString.call(value);
export const toRawType = (value) => toTypeString(value).slice(8, -1);

export const isIntegerKey = (key) => isString(key) && key !== "NaN" && key[0] !== "-" && String(parseInt(key, 10)) === key;

export const hasChanged = (value, oldValue) => value !== oldValue && (value === value || oldValue === oldValue);

export const def = (obj, key, value) => {
    Object.defineProperty(obj, key, {
        configurable: true,
        enumerable: false,
        value
    });
};

const hasOwnProperty = Object.prototype.hasOwnProperty;

export const hasOwn = (value, key) => hasOwnProperty.call(value, key);

export const removeFromArray = (arr, el) => {
    const idx = arr.indexOf(el);

    if (idx >= 0) {
        arr.splice(idx, 1);
    }
};

/**
 * Erzeugt eine Funktion um zu prüfen, ob ein Wert in der übergebenen List vorhanden ist.
 * @param {string[]|symbol[]} list - Eine Liste von Werten und Symbolen
 * @param {boolean} [expectsLowerCase] - Bei einer String-Liste kann können alle übergebenen Werte unabhängig von Groß- und Kleinschreibung überprüft werden.
 * @returns {function(string|symbol): boolean} - Die Prüffunktion
 */
export function makeMap(list, expectsLowerCase) {
    const map = list.reduce((map, el) => {
        map[el] = true;

        return map;
    }, Object.create(null));

    return expectsLowerCase ? val => !!map[val.toLowerCase()] : val => !!map[val];
}

/**
 *
 * @param {function(string|number): string} fn
 * @param {RouteParamsRaw} [params]
 * @returns {RouteParams}
 */
export function applyToParams(fn, params) {
    const newParams = {};

    for (const key in params) {
        const value = params[key];
        newParams[key] = Array.isArray(value) ? value.map(fn) : fn(value);
    }

    return newParams;
}

/**
 *
 * @param {*} obj
 * @returns {boolean}
 */
export function isESModule(obj) {
    return !!obj.__esModule || (Symbol && obj[Symbol.toStringTag] === "Module");
}

/**
 *
 * @param {function(): void} cb
 */
export const nextTick = (cb) => {
    requestAnimationFrame(() => {
        requestAnimationFrame(cb);
    });
};
