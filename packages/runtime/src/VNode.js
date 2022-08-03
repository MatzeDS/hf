import {
    isString,
    isArray,
    isObject,
    makeMap,
    isFunction
} from "../../shared/index.js";
import { componentRegister } from "./WebComponent.js";
import { BaseComponent } from "./BaseComponent.js";
import { FunctionalComponent } from "./FunctionalComponent.js";

/**
 * Die definition eines Slots.
 * @typedef {function(props: Object): string|VNode[]|null} ComputedSlot
 */

/**
 * Der Typ des virtuellen Knotens
 * @typedef {symbol} VNodeType
 */

/**
 * Ein Hook für einen virtuellen Knoten.
 * @typedef {function(VNode): void} VNodeMountHook
 */

/**
 * Die Eigenschaften des virtuellen Knotens
 * @typedef {Record<string, *>} VNodeProps
 * @property {Record<string, string>} [style] - Der Style für das Element
 * @property {string} [class] - Die Klassen für das Element
 * @property {string|number|symbol} [key] - Ein Schlüssel zur Identifizierung
 * @property {Reference} [ref] - Die Referenz für das Element
 * @property {VNodeMountHook|VNodeMountHook[]} [onVNodeBeforeMount]
 * @property {VNodeMountHook|VNodeMountHook[]} [onVNodeMounted]
 * @property {VNodeMountHook|VNodeMountHook[]} [onVNodeBeforeUpdate]
 * @property {VNodeMountHook|VNodeMountHook[]} [onVNodeUpdated]
 * @property {VNodeMountHook|VNodeMountHook[]} [onVNodeBeforeUnmount]
 * @property {VNodeMountHook|VNodeMountHook[]} [onVNodeUnmounted]
 */

/**
 * Die unverarbeiteten Eigenschaften des virtuellen Knotens
 * @typedef {Record<string, *>} RawProps
 * @property {RawStyle} [style] - Die unverarbeiteten Styles
 * @property {RawClass} [class] - Die unverarbeiteten Klassen
 * @property {VNodeMountHook|VNodeMountHook[]} [onVNodeBeforeMount]
 * @property {VNodeMountHook|VNodeMountHook[]} [onVNodeMounted]
 * @property {VNodeMountHook|VNodeMountHook[]} [onVNodeBeforeUpdate]
 * @property {VNodeMountHook|VNodeMountHook[]} [onVNodeUpdated]
 * @property {VNodeMountHook|VNodeMountHook[]} [onVNodeBeforeUnmount]
 * @property {VNodeMountHook|VNodeMountHook[]} [onVNodeUnmounted]
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

export const TEXT = Symbol("TEXT");
export const COMMENT = Symbol("COMMENT");
export const FRAGMENT = Symbol("FRAGMENT");
export const ELEMENT = Symbol("ELEMENT");
export const COMPONENT = Symbol("COMPONENT");

/**
 * Ist der übergebene Wert ein Typ für einen virtuellen Knoten
 * @type {function(symbol): boolean}
 */
export const isVNodeType = makeMap([ TEXT, COMMENT, FRAGMENT, ELEMENT, COMPONENT ]);

/**
 * Der virtuelle Knoten
 */
export class VNode {
    /**
     * Der Tag des virtuellen Knotens
     * @type {string|null}
     */
    tag;
    /**
     * Das Element des virtuellen Knotens
     * @type {Element|Node|BaseComponent|null}
     */
    el = null;
    /**
     * Der Anker für den virtuellen Knoten
     * @type {Node|null}
     */
    anchor = null;
    /**
     * Eine Referenz auf das Element des virtuellen Knotens
     * @type {Reference|null}
     */
    ref;
    /**
     * Der Schlüssel für den virtuellen Knoten
     * @type {string|number|null}
     */
    key;
    /**
     * Der Typ des virtuellen Knotens
     * @type {VNodeType}
     */
    type;
    /**
     * Konstruktor für die Web-Komponente
     * @type {CustomElementConstructor|FunctionConstructor|null}
     */
    component;
    /**
     * Die Eigenschaften des virtuellen Knotens
     * @type {VNodeProps|null}
     */
    props;
    /**
     * Die Kinder des virtuellen Knotens
     * @type {string|VNode[]|null}
     */
    children;
    /**
     * Slot-Funktionen für dei Web-Komponente
     * @type {Record<string, ComputedSlot>|null}
     */
    slots;
    /**
     * Die Instance der Web-Komponente
     * @type {WebComponent|null}
     */
    instance = null;
    /**
     * Transitions-Hooks
     * @type {VNodeTransitionHooks|null}
     */
    transition = null;

    /**
     * Konstruktor für den virtuellen Knoten.
     * @param {VNodeType|string|BaseComponent|null} type - Der Typ des Knotens,
     * @param {RawProps|null} [props] - Die Eigenschaften des virtuellen Knotens
     * @param {RawChildren|null} [children] - Die Kinder des virtuellen Knotens
     */
    constructor(type, props, children = null) {
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
            } else if (
                BaseComponent.prototype.isPrototypeOf(type) ||
                FunctionalComponent.prototype.isPrototypeOf(type)
            ) {
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
            this.children = normalizeChildren(children);
        }

        this.tag = tag;
        this.type = type;
        this.component = component;
        this.slots = slots;
        this.props = props;
        this.ref = props?.ref != null ? props.ref : null;
        this.key = props?.key != null ? props.key : null;
    }
}

/**
 * Erzeugt einen virtuellen Knoten.
 * @param {VNodeType|string|BaseComponent|null} type - Der Typ des Knotens,
 * @param {RawProps|null} [props] - Die Eigenschaften des virtuellen Knotens
 * @param {RawChildren|null} [children] - Die Kinder des virtuellen Knotens
 * @returns {VNode}
 */
export function h(type, props, children) {
    return new VNode(type, props, children);
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
                    children.push(new VNode(TEXT, null, c));
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
