export const EMPTY_OBJ = {};
export const EMPTY_ARR = [];

/**
 *
 * @type {function(): void}
 */
export const NOOP = () => {};

export const NO = () => false;

export const assign = Object.assign;

const onRE = /^on[^a-z]/;

export const isOn = (key) => onRE.test(key);

export const isArray = Array.isArray;
export const isMap = (value) => toTypeString(value) === "[object Map]";
export const isSet = (value) => toTypeString(value) === "[object Set]";
export const isPlainObject = (value) => toTypeString(value) === "[object Object]";
export const isFunction = (value) => typeof value === "function";
export const isString = (value) => typeof value === "string";
export const isSymbol = (value) => typeof value === "symbol";
export const isObject = (value) => value != null && typeof value === "object";
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

/**
 *
 * @param {string[]} list
 * @param {boolean} [expectsLowerCase]
 * @returns {function(string): boolean}
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
 * @param {*} value
 * @param {*} prototype
 * @returns {boolean}
 */
export function isPrototypeOf(value, prototype) {
    const p = Object.getPrototypeOf(value);

    return p ? p === prototype || isPrototypeOf(p, prototype) : false;
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
 * @typedef {Object} Callbacks
 * @property {function(Function): function(): void} add
 * @property {function(): void} reset
 * @property {function(): Function[]} list
 */

/**
 *
 * @returns {Callbacks}
 */
export function useCallbacks() {
    let handlers = [];

    function add(handler) {
        handlers.push(handler);

        return () => {
            const i = handlers.indexOf(handler);

            if (i > -1) {
                handlers.splice(i, 1);
            }
        };
    }

    function reset() {
        handlers = [];
    }

    return {
        add,
        list: () => handlers,
        reset
    };
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
