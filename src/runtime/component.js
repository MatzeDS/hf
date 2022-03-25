import { createVNode, COMMENT, FRAGMENT } from "./vnode.js";
import { isReservedProp, patch, patchProps, unmount } from "./renderer.js";
import { queueJob, queuePostFlushCallback } from "./scheduler.js";
import { insert, removeNode } from "../shared/dom.js";
import {
    effectScope,
    shallowReactive,
    toRaw,
    pauseTracking,
    resetTracking,
    proxyRefs,
    ReactiveEffect,
    readonly
} from "../reactivity/index.js";
import {
    isObject,
    isFunction,
    isArray,
    hasOwn,
    assign,
    EMPTY_OBJ
} from "../shared/utils.js";

/**
 * Die Definition der Eigenschaften.
 * @typedef {Record<string, { type: Function, default: * }>} PropsOptions
 */

/**
 * Triggert ein Event an der Web-Komponente.
 * @typedef {function(event: string, value: *): void} ComponentEmitter
 */

/**
 * Die Slots der Web-Komponente.
 * @typedef {Record<string, ComputedSlot>} Slots
 */

/**
 * Die Setup Funktion zur konfiguration der Komponente.
 * @typedef {function(props: Object, { attrs: Object, emit: ComponentEmitter, slots: Slots }): (Object|null)} Setup
 */

/**
 * Die Eigenschaften der Web-Komponente.
 * @typedef {Object} ComponentProperties
 * @property {Object} props - Die Eigenschaften der Web-Komponente
 * @property {Object} attrs - Die Attribute der Web-Komponente
 * @property {Slots} slots - Die Slots der Web-Komponente
 * @property {function(): void} update - Aktualisiert die Web-Komponente
 * @property {Setup|null} setup - Die Setup Funktion zur konfiguration der Komponente
 * @property {VNode|null} vnode - Der virtuelle Knoten der Web-Komponente
 * @property {function(container: Element, anchor: Node): void} mount - Fügt die Web-Komponente im Container vor dem Anker ein
 * @property {function(): void} unmount - Entfernt die Web-Komponente aus dem DOM
 */

/**
 * Die Basis Komponente aller Custom Elemente.
 * @typedef {HTMLElement & ComponentProperties} BaseComponent
 */

/**
 * Die funktionale Komponente ist kein Custom Element, verhält sich aber wie eines.
 * @typedef {ComponentProperties} FunctionalComponent
 */

/**
 * Die Web-Komponente.
 * @typedef {BaseComponent|FunctionalComponent} WebComponent
 */

const BEFORE_MOUNT_HOOK = "_bm";
const MOUNTED_HOOK = "_m";
const BEFORE_UPDATE_HOOK = "_bu";
const UPDATED_HOOK = "_u";
const BEFORE_UNMOUNT_HOOK = "_bum";
const UNMOUNTED_HOOK = "_um";

const FINALIZED = "_fin";

let uid = 0;

export let currentInstance = null;

/**
 * Setzt die aktuelle Instance der Web-Komponente auf die Übergebene.
 * @param {WebComponent} instance - Die Web-Komponente
 */
export const setCurrentInstance = (instance) => {
    currentInstance = instance;
    instance._scope.on();
};

/**
 * Entfernt die aktuellen Instance der Web-Komponente.
 */
export const unsetCurrentInstance = () => {
    if (currentInstance) {
        currentInstance._scope.off();
        currentInstance = null;
    }
};

/**
 * Gibt die aktuelle Instance zurück.
 * @returns {WebComponent|null}
 */
export const getCurrentInstance = () => {
    return currentInstance;
};

/**
 * Ruft alle Funktionen des Arrays mit dem übergebenen Argument auf.
 * @param {Function[]} fns - Die Funktionen
 * @param {*} [arg] - Das Argument
 */
const invokeArrayFns = (fns, arg) => {
    for (let i = 0; i < fns.length; i++) {
        fns[i](arg);
    }
};

/**
 * @implements {ComponentProperties}
 * @extends {HTMLElement}
 */
export class BaseComponent extends HTMLElement {
    static [FINALIZED] = true;

    /**
     * @param {RawProps} [props]
     * @param {WebComponent} [parent]
     */
    constructor(props, parent = null) {
        super();

        this._useShadowDom = false;

        initComponent(this, parent);
        initProps(this, props);
        setupComponent(this);
    }

    /**
     * Triggert ein Event an der Web-Komponente.
     * @type {ComponentEmitter}
     */
    emit(event, data) {
        this.dispatchEvent(new CustomEvent(event, {
            detail: {
                from: this,
                data
            }
        }));
    }

    /**
     * Bindet die Komponente in den DOM ein.
     * @param {Element} container - Der Container, in den die Web-Komponente eingebunden werden soll
     * @param {Node} anchor - Der Anker, vor dem die Web-Komponente eingebunden werden soll
     */
    mount(container, anchor) {
        insert(this, container, anchor);
    }

    /**
     * Entfernt die Web-Komponente aus dem DOM.
     */
    unmount() {
        if (this[BEFORE_UNMOUNT_HOOK]) {
            invokeArrayFns(this[BEFORE_UNMOUNT_HOOK]);
        }

        unmount(this._subTree, this);
        removeNode(this);

        this._isUnmounted = true;
    }

    connectedCallback() {
        if (!this._isMounted) {
            updateAttributes(this);
            setupRenderer(this, this._useShadowDom ? this.shadowRoot : this, null);
        }
    }

    disconnectedCallback() {
        if (!this._isUnmounted) {
            this.unmount();
        }

        if (this[UNMOUNTED_HOOK]) {
            invokeArrayFns(this[UNMOUNTED_HOOK]);
        }
    }
}

/**
 * @implements {ComponentProperties}
 */
export class FunctionalComponent {
    static [FINALIZED] = true;
    static get isFunctional() {
        return true;
    }

    /**
     * @param {RawProps} props
     * @param {WebComponent} parent
     */
    constructor(props, parent = null) {
        initComponent(this, parent);
        initProps(this, props);
        setupComponent(this);
    }

    get isFunctional() {
        return true;
    }

    /**
     * Bindet die Komponente in den DOM ein.
     * @param {Element} container - Der Container, in den die Web-Komponente eingebunden werden soll
     * @param {Node} anchor - Der Anker, vor dem die Web-Komponente eingebunden werden soll
     */
    mount(container, anchor) {
        if (!this._isMounted) {
            setupRenderer(this, container, anchor);
        }
    }

    /**
     * Entfernt die Web-Komponente aus dem DOM.
     */
    unmount() {
        if (this[BEFORE_UNMOUNT_HOOK]) {
            invokeArrayFns(this[BEFORE_UNMOUNT_HOOK]);
        }

        unmount(this._subTree, this);

        this._isUnmounted = true;

        if (this[UNMOUNTED_HOOK]) {
            invokeArrayFns(this[UNMOUNTED_HOOK]);
        }
    }
}

/**
 *
 * @param {WebComponent} instance
 * @param {WebComponent} parent
 */
function initComponent(instance, parent) {
    instance._uid = uid++;
    instance._parent = parent;
    instance._setupState = null;
    instance._scope = effectScope();
    instance._effect = null;
    instance._propsOptions = instance.constructor._propsOptions;
    instance._subTree = null;

    instance._isMounted = false;
    instance._isUnmounted = false;

    instance[BEFORE_MOUNT_HOOK] = null;
    instance[MOUNTED_HOOK] = null;
    instance[BEFORE_UPDATE_HOOK] = null;
    instance[UPDATED_HOOK] = null;
    instance[BEFORE_UNMOUNT_HOOK] = null;
    instance[UNMOUNTED_HOOK] = null;
}

/**
 * Löst den Wert der Eigenschaften auf, in dem der Defaultwert gesetzt wird,
 * wenn kein Wert übergeben wird und in der Definition der Eigenschaft ein Default definiert wurde.
 * @param {PropsOptions} options - Die Definitionen der Eigenschaften
 * @param {RawProps} props - Die unverarbeiteten Eigenschaften
 * @param {string} key - Der Schlüsselname der Eigenschaft
 * @param {*} value - Der Wert der Eigenschaft
 * @param {boolean} isAbsent - Ist die Eigenschaft abwesend
 * @returns {*} Der Wert der Eigenschaft
 */
function resolvePropValue(options, props, key, value, isAbsent) {
    const opt = options[key];

    if (opt != null) {
        const hasDefault = hasOwn(opt, "default");

        if (hasDefault && value === undefined) {
            const defaultValue = opt.default;

            if (!opt.type.includes(Function) && isFunction(defaultValue)) {
                value = defaultValue(props);
            } else {
                value = defaultValue;
            }
        }

        if (opt.type.includes(Boolean)) {
            if (isAbsent && !hasDefault) {
                value = false;
            } else if (value === "" || value === key) {
                value = true;
            }
        }
    }

    return value;
}

/**
 * Initialisiert die Eigenschaften der Web-Komponente.
 * @param {WebComponent} instance - Die Web-Komponente
 * @param {RawProps} rawProps - Die unverarbeiteten Eigenschaften
 */
function initProps(instance, rawProps) {
    const props = {};
    const attrs = {};

    setFullProps(instance, rawProps, props, attrs);

    instance.props = shallowReactive(props);
    instance.attrs = attrs;
}

/**
 * Updatet die Eigenschaften der Web-Komponente.
 * @param {WebComponent} instance - Die Web-Komponente
 * @param {RawProps} newProps - Die neuen unverarbeiteten Eigenschaften
 * @param {RawProps} oldProps - Die alten unverarbeiteten Eigenschaften
 */
function updateProps(instance, newProps, oldProps) {
    const props = instance.props;
    const attrs = instance.attrs;

    const oldAttrs = assign({}, attrs);
    const rawCurrentProps = toRaw(props);
    const options = instance._propsOptions;

    const hasAttrsChanged = setFullProps(instance, newProps, props, attrs);

    for (const key in rawCurrentProps) {
        if (!newProps || !hasOwn(newProps, key)) {
            if (options) {
                if (oldProps && oldProps[key] !== undefined) {
                    props[key] = resolvePropValue(options, oldProps, key, undefined, true);
                }
            } else {
                delete props[key];
            }
        }
    }

    if (hasAttrsChanged) {
        updateAttributes(instance, oldAttrs);
    }
}

/**
 * Updatet die Attribute der Komponente.
 * @param {BaseComponent} instance - Die Web-Komponente
 * @param {VNodeProps} [oldAttrs] - Die alten Attribute der Komponente
 */
function updateAttributes(instance, oldAttrs = EMPTY_OBJ) {
    patchProps(instance, oldAttrs, instance.attrs);
}

/**
 * Setzte die Eigenschaften aus dem virtuellen Knoten in die Eigenschaften und Attribute der Komponente ein.
 * @param {WebComponent} instance - Die Web-Komponente
 * @param {RawProps} rawProps - Die unverarbeiteten Eigenschaften aus dem virtuellen Knoten
 * @param {Record<string, *>} props - Die Eigenschaften der Web-Komponente
 * @param {Record<string, *>} attrs - Die Attribute der Web-Komponente
 * @returns {boolean} Wurden Attribute verändert?
 */
function setFullProps(instance, rawProps, props, attrs) {
    const options = instance._propsOptions;
    let hasAttrsChanged = false;

    if (rawProps) {
        for (const key in rawProps) {
            if (!isReservedProp(key)) {
                const value = rawProps[key];

                if (options && options[key]) {
                    props[key] = value;
                } else if (value !== attrs[key]) {
                    attrs[key] = value;
                    hasAttrsChanged = true;
                }
            }
        }
    }

    return hasAttrsChanged;
}

/**
 * Triggert der Web-Komponente, dass sie ein Shadow DOM nutzen soll.
 * @param {BaseComponent} instance - Die Web-Komponente
 */
function useShadowDom(instance) {
    return (options = { mode: "open" }) => {
        if (!instance._useShadowDom) {
            instance._useShadowDom = true;
            instance.attachShadow(options);
        }
    };
}

/**
 * Erstellt die Web-Komponente durch die Setup-Methode.
 * @param {WebComponent} instance - Die Web-Komponente
 */
function setupComponent(instance) {
    const setup = instance.setup;

    if (setup) {
        const setupContext = (instance._setupContext = setup.length > 1
            ? {
                attrs: readonly(instance.attrs),
                emit: instance.emit,
                useShadowDom: useShadowDom(instance)
            }
            : null
        );

        setCurrentInstance(instance);
        pauseTracking();

        const setupResult = setup.call(instance, instance.props, setupContext);

        resetTracking();
        unsetCurrentInstance();

        if (isObject(setupResult)) {
            instance._setupState = proxyRefs(setupResult);
        }
    }
}

/**
 * Erstellt den Renderer für die Web-Komponente und rendert diesen initial.
 * @param {WebComponent} instance - Die Web-Komponente
 * @param {Element} container - Der Container, in den das Element eingebunden werden soll
 * @param {Node} anchor - Der Anker, vor dem das Element eingebunden werden soll
 */
function setupRenderer(instance, container, anchor) {
    const updateFn = () => {
        if (!instance._isMounted) {
            toggleRecurse(instance, false);

            if (instance[BEFORE_MOUNT_HOOK]) {
                invokeArrayFns(instance[BEFORE_MOUNT_HOOK]);
            }

            toggleRecurse(instance, true);

            instance.slots = instance.vnode?.slots || {};

            const subTree = (instance._subTree = renderComponentTree(instance));

            patch(
                null,
                subTree,
                container,
                anchor,
                instance._parent
            );

            if (instance[MOUNTED_HOOK]) {
                queuePostFlushCallback(instance[MOUNTED_HOOK]);
            }

            instance._isMounted = true;
        } else {
            toggleRecurse(instance, false);

            if (instance._next) {
                const prevProps = instance.vnode.props;
                instance.vnode = instance._next;
                instance.slots = instance.vnode.slots;
                instance._next = null;
                updateProps(instance, instance.vnode.props, prevProps);
            }

            if (instance[BEFORE_UPDATE_HOOK]) {
                invokeArrayFns(instance[BEFORE_UPDATE_HOOK]);
            }

            toggleRecurse(instance, true);

            const prevTree = instance._subTree;
            const subTree = instance._subTree = renderComponentTree(instance);

            patch(
                prevTree,
                subTree,
                container,
                null,
                instance._parent
            );

            if (instance[UPDATED_HOOK]) {
                queuePostFlushCallback(instance[UPDATED_HOOK]);
            }
        }
    };

    const effect = (instance._effect = new ReactiveEffect(
        updateFn,
        () => queueJob(instance.update),
        instance._scope
    ));
    const update = (instance.update = effect.run.bind(effect));

    update.id = instance._uid;
    toggleRecurse(instance, true);

    update();
}

/**
 * Erlaubt es, die Rekursion für den Effect und den dazu gehörenden Job an oder aus zu schalten.
 * @param {ReactiveEffect} _effect - Der reaktive Effect der Instance
 * @param {Job} update - Die Update-Funktion der Instance
 * @param {boolean} allowed - Erlaubt oder verbietet die Rekursion
 */
function toggleRecurse({ _effect, update }, allowed) {
    _effect.allowRecurse = update.allowRecurse = allowed;
}

/**
 * Erzeugt den virtuellen Baum der Komponente
 * @param {WebComponent} instance - Die Web-Komponente
 * @returns {VNode|null} Der virtuelle Baum
 */
function renderComponentTree(instance) {
    const { props, emit, slots, _setupState, isFunctional } = instance;
    let root;

    try {
        root = instance.render?.(_setupState, { props, emit, slots, instance });
    } catch (err) {
        console.error(err);
        root = null;
    }

    if (!root) {
        root = createVNode(COMMENT);
    }

    if (isArray(root) || isFunctional) {
        return createVNode(FRAGMENT, null, root);
    }

    return root;
}

/**
 * Finalisiert die Eigenschaften der Komponente.
 * @param {CustomElementConstructor} component - Die Web-Komponente
 */
function finalize(component) {
    if (hasOwn(component, FINALIZED)) {
        return;
    }

    const proto = Object.getPrototypeOf(component);

    if (!hasOwn(proto, FINALIZED)) {
        finalize(proto);
    }

    const protoProps = proto._propsOptions;
    const props = normalizePropsOptions(component);

    if (protoProps || props) {
        const normalized = component._propsOptions = {};

        if (protoProps) {
            assign(normalized, protoProps);
        }

        if (props) {
            assign(normalized, props);
        }
    }

    component[FINALIZED] = true;
}

function normalizePropsOptions(component) {
    const props = component.props;

    if (!props) {
        return null;
    }

    const rawProps = props();
    const normalized = {};

    if (isObject(rawProps)) {
        Object.entries(rawProps).forEach(([key, val]) => {
            if (val != null) {
                let prop;

                if (isFunction(val)) {
                    prop = {
                        type: [val]
                    };
                } else if (isArray(val)) {
                    prop = {
                        type: val
                    };
                } else if (isObject(val)) {
                    prop = {
                        type: isArray(val.type) ? val.type : [val.type]
                    };

                    if (hasOwn(val, "default")) {
                        prop.default = val.default;
                    }
                }

                if (prop) {
                    normalized[key] = prop;
                }
            }
        });
    }

    return normalized;
}

export const componentRegister = new Map();

/**
 * Registriert die Komponente, um sie global verfügbar zu machen.
 * @param {CustomElementConstructor|FunctionConstructor} component
 */
export function registerComponent(component) {
    const tag = component.tag;

    if (!tag) {
        console.error(`Missing static tag field in component "${component}"`);
    } else if (tag.indexOf("-") < 0) {
        console.error(`Missing "-" in component tag "${tag}"`);
    } else if (!componentRegister.has(tag)) {
        finalize(component);

        componentRegister.set(tag, component);

        if (HTMLElement.prototype.isPrototypeOf(component)) {
            customElements.define(tag, component);
        }
    }
}

/**
 * Erzeugt einen Lifecycle-Listener.
 * @param {string} hook - Der Hook
 * @returns {function(function(): void): void} Der Lifecycle-Listener
 */
function createLifecycleListener(hook) {
    return (fn) => {
        if (currentInstance) {
            if (!currentInstance[hook]) {
                currentInstance[hook] = [fn];
            } else {
                currentInstance[hook].push(fn);
            }
        }
    };
}

/**
 * Der übergebene Hook wird vor dem Einbinden in den DOM ausgeführt.
 * @type {function(function(): void): void}
 */
export const onBeforeMount = createLifecycleListener(BEFORE_MOUNT_HOOK);

/**
 * Der übergebene Hook wird nach dem Einbinden in den DOM ausgeführt.
 * @type {function(function(): void): void}
 */
export const onMounted = createLifecycleListener(MOUNTED_HOOK);

/**
 * Der übergebene Hook wird vor dem Update des DOMs ausgeführt.
 * @type {function(function(): void): void}
 */
export const onBeforeUpdate = createLifecycleListener(BEFORE_UPDATE_HOOK);

/**
 * Der übergebene Hook wird nach dem Update des DOMS ausgeführt.
 * @type {function(function(): void): void}
 */
export const onUpdated = createLifecycleListener(UPDATED_HOOK);

/**
 * Der übergebene Hook wird vor dem Entfernen aus dem DOM ausgeführt.
 * @type {function(function(): void): void}
 */
export const onBeforeUnmount = createLifecycleListener(BEFORE_UNMOUNT_HOOK);

/**
 * Der übergebene Hook wird nach dem Entfernen aus dem DOM ausgeführt.
 * @type {function(function(): void): void}
 */
export const onUnmounted = createLifecycleListener(UNMOUNTED_HOOK);
