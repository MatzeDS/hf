import {
    BaseComponent,
    FunctionalComponent,
    componentRegister
} from "./component.js";
import {
    isString,
    isArray,
    isObject,
    makeMap,
    isFunction
} from "../shared/utils.js";

/**
 * @typedef {function(props: Object): string|VNode[]|null} ComputedSlot
 */

/**
 * Der virtuelle Knoten
 * @typedef {Object} VNode
 * @property {VNodeType} type - Der Typ des virtuellen Knotens
 * @property {string|null} tag - Der Tag des virtuellen Knotens
 * @property {VNodeProps|null} props - Die Eigenschaften des virtuellen Knotens
 * @property {string|VNode[]|null} children - Die Kinder des virtuellen Knotens
 * @property {string|number|null} key - Der Schlüssel für den virtuellen Knoten
 * @property {Reference|null} ref - Eine Referenz auf das Element des virtuellen Knotens
 * @property {Element|Node|BaseComponent|null} el - Das Element des virtuellen Knotens
 * @property {Node|null} anchor - Der Anker für den virtuellen Knoten
 * @property {CustomElementConstructor|FunctionConstructor|null} component - Konstruktor für die Web-Komponente
 * @property {WebComponent|null} instance - Die Instance der Web-Komponente
 * @property {VNodeTransitionHooks|null} transition - Transitions-Hooks
 * @property {Record<string, ComputedSlot>|null} slots - Slot-Funktionen für dei Web-Komponente
 */

/**
 * Der Typ des virtuellen Knotens
 * @typedef {symbol} VNodeType
 */

/**
 * Die Eigenschaften des virtuellen Knotens
 * @typedef {Record<string, *>} VNodeProps
 * @property {Record<string, string>} [style] - Der Style für das Element
 * @property {string} [class] - die Klassen für das Element
 */

/**
 * Die unverarbeiteten Eigenschaften des virtuellen Knotens
 * @typedef {Record<string, *>} RawProps
 * @property {RawStyle} [style] - Die unverarbeiteten Styles
 * @property {RawClass} [class] - Die unverarbeiteten Klassen
 */

/**
 * Die unverarbeiteten Kinder des virtuellen Knotens
 * @typedef {string|VNode|RawChildren[]} RawChildren
 */

/**
 * Die unverarbeiteten Styles
 * @typedef {string|Record<string, string>|RawStyle[]} RawStyle
 */

/**
 * Die unverarbeiteten Klassen
 * @typedef {string|Record<string,boolean>|RawClass[]} RawClass
 */

/**
 *
 * @type {VNodeType}
 */
export const TEXT = Symbol("TEXT");

/**
 *
 * @type {VNodeType}
 */
export const COMMENT = Symbol("COMMENT");

/**
 *
 * @type {VNodeType}
 */
export const FRAGMENT = Symbol("FRAGMENT");

/**
 *
 * @type {VNodeType}
 */
export const ELEMENT = Symbol("ELEMENT");

/**
 *
 * @type {VNodeType}
 */
export const COMPONENT = Symbol("COMPONENT");

/**
 * Ist der übergebene Wert ein Typ für einen virtuellen Knoten
 * @type {function(symbol): boolean}
 */
export const isVNodeType = makeMap([ TEXT, COMMENT, FRAGMENT, ELEMENT, COMPONENT ]);

/**
 * Erzeugt einen virtuellen Knoten
 * @param {VNodeType|string|BaseComponent|null} type - Der Typ des Knotens,
 * @param {RawProps|null} [props] - Die Eigenschaften des virtuellen Knotens
 * @param {RawChildren|null} [children] - Die Kinder des virtuellen Knotens
 * @return {VNode} Der virtuelle Knoten
 */
export function createVNode(type, props, children = null) {
    let component = null;
    let slots = null;
    let tag = null;

    if (!isVNodeType(type)) {
        if (isString(type)) {
            if (type.includes("-")) {
                component = componentRegister.get(tag);
                type = COMPONENT;
            } else {
                tag = type;
                type = ELEMENT;
            }
        } else if (BaseComponent.prototype.isPrototypeOf(type) || FunctionalComponent.prototype.isPrototypeOf(type)) {
            component = type;
            tag = component.tag;
            type = COMPONENT;
        } else {
            type = COMMENT;
        }
    }

    if (props) {
        if (props.class) {
            props.class = normalizeClass(props.class);
        }

        if (props.style) {
            props.style = normalizeStyle(props.style);
        }
    }

    if (type === COMPONENT) {
        if (!component) {
            throw new Error(`Component "${tag}" not found`);
        }

        slots = normalizeSlots(children);
    } else if (type !== TEXT) {
        children = normalizeChildren(children);
    }

    return {
        tag,
        el: null,
        anchor: null,
        ref: props?.ref != null ? props.ref : null,
        key: props?.key != null ? props.key : null,
        type,
        component,
        props,
        children,
        slots,
        instance: null,
        transition: null
    };
}

/**
 * Normalisiert die Kinder eines virtuellen Knotens
 * @param {RawChildren|null} children - Die Kinder
 * @return {string|VNode[]|null} - Die normalisierten Kinder
 */
function normalizeChildren(children) {
    if (children == null) {
        return null;
    } else if (isArray(children)) {
        return children.reduce((children, child) => {
            const c = normalizeChildren(child);

            if (c) {
                if (isArray(c)) {
                    children.push(...c);
                } else {
                    children.push(createVNode(TEXT, null, c));
                }
            }

            return children;
        }, []);
    } else if (isObject(children)) {
        return [children];
    } else {
        return String(children);
    }
}

/**
 * Normalisiert die Slots.
 * @param {RawChildren|Record<string,ComputedSlot>|ComputedSlot|null} children
 * @returns {Record<string,ComputedSlot>}
 */
function normalizeSlots(children) {
    if (children == null) {
        return {};
    } else if (isFunction(children)) {
        return { default: children };
    } else if (isObject(children) && Object.values(children).every(child => isFunction(child))) {
        return children;
    } else {
        const normalizedChildren = normalizeChildren(children);

        return { default: () => normalizedChildren };
    }
}

/**
 * Normalisiert die Styles
 * @param {RawStyle} value - Die unverarbeiteten Styles
 * @returns {Record<string, string>} Die normalisierten Styles
 */
function normalizeStyle(value) {
    if (isArray(value)) {
        const res = {};

        for (let i = 0; i < value.length; i++) {
            const normalized = normalizeStyle(value[i]);

            if (normalized) {
                for (const key in normalized) {
                    res[key] = normalized[key];
                }
            }
        }

        return res;
    } else if (isString(value)) {
        return parseStyle(value);
    } else if (isObject(value)) {
        return value;
    }
}


const styleDelimiter = /;(?![^(]*\))/g;
const styleItemDelimiter = /:(.+)/;

/**
 * Parst den CSS String
 * @param {string} cssString - Der zu parsende CSS String
 * @returns {Record<string, string>} Die normalisierten Styles
 */
function parseStyle(cssString) {
    const ret = {};

    cssString.split(styleDelimiter).forEach(item => {
        if (item) {
            const [ key, val ] = item.split(styleItemDelimiter);

            if (key && val) {
                ret[key.trim()] = val.trim();
            }
        }
    });

    return ret;
}

/**
 * Normalisiert die Klassen
 * @param {RawClass} value - Die unverarbeiteten Klassen
 * @returns {string} Die Klassen als ein normalisierter String
 */
function normalizeClass(value) {
    let res = "";

    if (isString(value)) {
        res = value;
    } else if (isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            const normalized = normalizeClass(value[i]);

            if (normalized) {
                res += normalized + " ";
            }
        }
    } else if (isObject(value)) {
        for (const name in value) {
            if (value[name]) {
                res += name + " ";
            }
        }
    }

    return res.trim();
}
