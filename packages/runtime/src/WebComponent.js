import {
    isObject,
    isFunction,
    isArray,
    hasOwn,
    assign, removeFromArray
} from "../../shared/index.js";
import {
    ReactiveEffect,
    effectScope,
    shallowReactive,
    toRaw,
    pauseTracking,
    resetTracking,
    proxyRefs,
    readonly
} from "../../reactivity/index.js";
import {
    VNode,
    COMMENT,
    FRAGMENT
} from "./VNode.js";
import {
    isReservedProp,
    patch,
    unmount
} from "./renderer.js";
import {
    invalidateJob,
    queueJob,
    queuePostFlushCallback
} from "./scheduler.js";

/**
 * Die Definition der Eigenschaften.
 * @typedef {Record<string, { type: Function, default: * }>} PropsOptions
 */

/**
 * Die Definition der Eigenschaften.
 * @typedef {Record<string, { type: Function, default: * }>} NormalizedPropsOptions
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
 * @template {Object|HTMLElement} T
 * @class WebComponent<T>
 * @extends {T}
 */

/**
 * Index für den eindeutigen Identifier.
 * @type {number}
 */
let uid = 0;

export const FINALIZED = "#fin";

/**
 * Die aktuelle Instance der Web-Komponente.
 * @type {WebComponent|null}
 */
export let currentInstance = null;

/**
 * Setzt die aktuelle Instance der Web-Komponente auf die Übergebene.
 * @param {WebComponent} instance - Die Web-Komponente
 */
export const setCurrentInstance = (instance) => {
    currentInstance = instance;
    instance.scopeOn();
};

/**
 * Entfernt die aktuellen Instance der Web-Komponente.
 */
export const unsetCurrentInstance = () => {
    if (currentInstance) {
        currentInstance.scopeOff();
        currentInstance = null;
    }
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
 * @template {Object|HTMLElement} T
 * @param {T} superClass
 * @returns {WebComponent}
 */
export const webComponentExtends = (superClass) => class WebComponent extends superClass {
    /**
     * Die eindeutige ID der Komponente.
     * @type {number}
     */
    #uid = uid++;
    /**
     * Die Eltern-Komponente.
     * @type {WebComponent}
     */
    #parent;
    /**
     * Der reaktive State, der durch die Setup-Funktion erzeugt wurde.
     * @type {Proxy}
     */
    #setupState;
    /**
     * Der Bereich, in dem alle reaktiven Effekte gespeichert werden.
     * @type {EffectScope}
     */
    #scope;
    /**
     * Steuert das Neu-Rendern der Komponente bei Updates.
     * @type {ReactiveEffect}
     */
    #effect;
    /**
     * Die Optionen der Properties.
     * @type {NormalizedPropsOptions}
     */
    #propsOptions;
    /**
     * Der virtuelle DOM, innerhalb der Komponente.
     * @type {VNode}
     */
    #subTree;
    /**
     * Der virtuelle Knoten, der den aktuellen ersetzt.
     * @type {VNode}
     */
    #next;
    /**
     * Die Properties der Komponente.
     * @type {Proxy}
     */
    #props;
    /**
     * Die Attribute der Komponente.
     * @type {Record<string, *>}
     */
    #attrs;
    /**
     * Die Slots der Komponente.
     * @type {Record<string, ComputedSlot>}
     */
    #slots;
    /**
     * Die von der Komponente und deren Eltern-Komponenten bereitgestellte Daten.
     * @type {Record<string|symbol, *>}
     */
    provides;
    /**
     * Der virtuelle Knoten, der Komponente.
     * @type {VNode}
     */
    #vnode;
    /**
     * Ist die Komponente gemounted.
     * @type {boolean}
     */
    #isMounted = false;
    /**
     * Ist die komponente nicht mehr gemounted.
     * @type {boolean}
     */
    #isUnmounted = false;
    /**
     * Hooks die aufgerufen werden, bevor die Komponente gemounted wird.
     * @type {Array<function():void>}
     */
    #bm;
    /**
     * Hooks die aufgerufen werden, nachdem die Komponente gemounted wurde.
     * @type {Array<function():void>}
     */
    #m;
    /**
     * Hooks die aufgerufen werden, bevor die Komponente geupdated wird.
     * @type {Array<function():void>}
     */
    #bu;
    /**
     * Hooks die aufgerufen werden, nachdem die Komponente geupdated wurde.
     * @type {Array<function():void>}
     */
    #u;
    /**
     * Hooks die aufgerufen werden, bevor die Komponente entfernt wird.
     * @type {Array<function():void>}
     */
    #bum;
    /**
     * Hooks die aufgerufen werden, nachdem die Komponente entfernt wurde.
     * @type {Array<function():void>}
     */
    #um;

    get parent() {
        return this.#parent;
    }

    /**
     * Ist die Komponente gemounted.
     * @return {boolean}
     */
    get isMounted() {
        return this.#isMounted;
    }

    /**
     * Ist die komponente nicht mehr gemounted.
     * @return {boolean}
     */
    get isUnmounted() {
        return this.#isUnmounted;
    }

    /**
     * ID der Komponente.
     * @return {number}
     */
    get uid() {
        return this.#uid;
    }

    /**
     * Der Sub-Tree der Komponente.
     * @return {VNode}
     */
    get subTree() {
        return this.#subTree;
    }

    /**
     * Konstruktor für die Web-Komponente.
     * @param {RawProps} [rawProps] - Die Properties
     * @param {VNode} [vNode] - Der virtuelle Knoten
     * @param {WebComponent|null} [parent] - Die Eltern-Komponente
     */
    constructor(rawProps, vNode, parent = null) {
        super();

        this.#vnode = vNode;
        this.#parent = parent;
        this.provides = parent?.provides || {};

        this.#scope = effectScope();
        this.#propsOptions = this.constructor.propsOptions;

        this.#initProps(rawProps);
        this.#setupComponent();
    }

    /**
     * Initialisiert die Eigenschaften der Web-Komponente.
     * @param {RawProps} rawProps - Die unverarbeiteten Eigenschaften
     */
    #initProps(rawProps) {
        const props = {};
        const attrs = {};

        setFullProps(this.#propsOptions, rawProps, props, attrs);

        this.#props = shallowReactive(props);
        this.#attrs = attrs;
    }

    /**
     * Erstellt die Web-Komponente durch die Setup-Methode.
     */
    #setupComponent() {
        if (this.setup) {
            const setupContext = this.setup.length > 1
                ? {
                    attrs: readonly(this.#attrs),
                    emit: this.emit.bind(this),
                    instance: this
                }
                : null;

            setCurrentInstance(this);
            pauseTracking();

            const setupResult = this.setup(this.#props, setupContext);

            resetTracking();
            unsetCurrentInstance();

            if (isObject(setupResult)) {
                this.#setupState = proxyRefs(setupResult);
            }
        }
    }

    /**
     * Erstellt den Renderer für die Web-Komponente und rendert diesen initial.
     * @param {Element} container - Der Container, in den das Element eingebunden werden soll
     * @param {Node} [anchor] - Der Anker, vor dem das Element eingebunden werden soll
     */
    #setupRenderer(container, anchor) {
        const updateFn = () => {
            if (!this.#isMounted) {
                const vNode = this.#vnode;

                this.toggleRecurse(false);

                if (this.#bm) {
                    invokeArrayFns(this.#bm);
                }

                if (vNode?.props.onVNodeBeforeMount) {
                    vNode.props.onVNodeBeforeMount(vNode);
                }

                this.toggleRecurse(true);
                this.#slots = vNode?.slots || {};
                const subTree = (this.#subTree = this.#renderComponentTree());

                patch(
                    null,
                    subTree,
                    container,
                    anchor,
                    this.#parent
                );

                if (this.#m) {
                    queuePostFlushCallback(this.#m);
                }

                if (vNode?.props.onVNodeMounted) {
                    queuePostFlushCallback(() => vNode.props.onVNodeMounted(vNode));
                }

                this.#isMounted = true;
            } else {
                this.toggleRecurse(false);

                const vNode = this.#vnode;
                let next = this.#next;

                if (next) {
                    const prevProps = vNode?.props;
                    this.#vnode = next;
                    this.#slots = next.slots;
                    this.#next = null;
                    this.#updateProps(next.props, prevProps);
                } else {
                    next = vNode;
                }

                if (this.#bu) {
                    invokeArrayFns(this.#bu);
                }

                if (next?.props.onVNodeBeforeUpdate) {
                    next?.props.onVNodeBeforeUpdate(next, vNode);
                }

                this.toggleRecurse(true);

                const prevTree = this.#subTree;
                const subTree = this.#subTree = this.#renderComponentTree();

                patch(
                    prevTree,
                    subTree,
                    container,
                    null,
                    this.#parent
                );

                if (this.#u) {
                    queuePostFlushCallback(this.#u);
                }

                if (next?.props.onVNodeUpdated) {
                    queuePostFlushCallback(() => {
                        next?.props.onVNodeUpdated(next, vNode);
                    });
                }
            }
        };

        const effect = (this.#effect = new ReactiveEffect(
            updateFn,
            () => queueJob(this.update),
            this.#scope
        ));
        const update = (this.update = effect.run.bind(effect));

        update.id = this.uid;
        this.toggleRecurse(true);

        update();
    }

    /**
     * Updatet die Eigenschaften der Web-Komponente.
     * @param {RawProps} newProps - Die neuen unverarbeiteten Eigenschaften
     * @param {RawProps} oldProps - Die alten unverarbeiteten Eigenschaften
     */
    #updateProps(newProps, oldProps) {
        const props = this.#props;
        const attrs = this.#attrs;

        const oldAttrs = assign({}, attrs);
        const rawCurrentProps = toRaw(props);
        const options = this.#propsOptions;

        const hasAttrsChanged = setFullProps(options, newProps, props, attrs);

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

        if (hasAttrsChanged && this._updateAttributes) {
            this._updateAttributes(attrs, oldAttrs);
        }
    }

    /**
     * Erlaubt es, die Rekursion für den Effect und den dazu gehörenden Job an oder aus zu schalten.
     * @param {boolean} allowed - Erlaubt oder verbietet die Rekursion
     */
    toggleRecurse(allowed) {
        this.#effect.allowRecurse = this.update.allowRecurse = allowed;
    }

    /**
     * Erzeugt den virtuellen Baum der Komponente
     * @returns {VNode} Der virtuelle Baum
     */
    #renderComponentTree() {
        let root;

        try {
            root = this.render?.(
                this.#setupState,
                {
                    props: this.#props,
                    attrs: this.#attrs,
                    slots: this.#slots,
                    emit: this.emit.bind(this),
                    instance: this
                }
            );
        } catch (err) {
            console.error(err);
            root = null;
        }

        if (!root) {
            root = new VNode(COMMENT);
        }

        if (isArray(root) || this.isFunctional) {
            return new VNode(FRAGMENT, null, root);
        }

        return root;
    }

    /**
     * Bindet die Komponente in den DOM ein.
     * @param {Element} container - Der Container, in den die Web-Komponente eingebunden werden soll
     * @param {Node} [anchor] - Der Anker, vor dem die Web-Komponente eingebunden werden soll
     */
    mount(container, anchor) {
        if (!this.#isMounted) {
            this.#setupRenderer(container, anchor);
        }
    }

    /**
     * Entfernt die Komponente aus dem DOM.
     * @param {function(): void} [removeElement] - Entfernt das Element, welches die Komponente repräsentiert
     */
    unmount(removeElement) {
        if (!this.#isUnmounted) {
            if (this.#bum) {
                invokeArrayFns(this.#bum);
            }

            unmount(this.#subTree, this);
            this.#isUnmounted = true;
            removeElement?.();

            if (this.#um) {
                invokeArrayFns(this.#um);
            }
        }
    }

    /**
     * Aktiviert den Scope der Komponente.
     */
    scopeOn() {
        this.#scope.on();
    }

    /**
     * Deaktiviert den Scope der Komponente.
     */
    scopeOff() {
        this.#scope.off();
    }

    /**
     * Entfernt eine Effect aus dem Scope der Komponente.
     * @param {ReactiveEffect} effect - Der Effect
     */
    removeScopeEffect(effect) {
        removeFromArray(this.#scope.effects, effect);
    }

    /**
     * Updated die Komponente durch einen neuen virtuellen Knoten.
     * @param {VNode} vNode - Der virtuelle Knoten
     * @param {boolean} [triggerUpdate=true] - Soll ein Update der Komponente angestoßen werden
     */
    updateVNode(vNode, triggerUpdate = true) {
        this.#next = vNode;

        if (triggerUpdate) {
            invalidateJob(this.update);
            this.update();
        }
    }

    /**
     * Fügt eine Funktion dem Hook der Komponente hinzu.
     * @param {LifecycleHook} hook - Der Typ des Hooks
     * @param {function(): void} fn - Die Funktion des Hooks
     */
    addHook(hook, fn) {
        if (!this[hook]) {
            this[hook] = [fn];
        } else {
            this[hook].push(fn);
        }
    }
};

/**
 * Löst den Wert der Eigenschaften auf, in dem der Defaultwert gesetzt wird,
 * wenn kein Wert übergeben wird und in der Definition der Eigenschaft ein Default definiert wurde.
 * @param {NormalizedPropsOptions} options - Die Definitionen der Eigenschaften
 * @param {RawProps} props - Die unverarbeiteten Eigenschaften
 * @param {string} key - Der Schlüsselname der Eigenschaft
 * @param {*} value - Der Wert der Eigenschaft
 * @param {boolean} isAbsent - Ist die Eigenschaft abwesend
 * @returns {*} Der Wert der Eigenschaft
 */
function resolvePropValue(options, props, key, value, isAbsent) {
    if (key in options) {
        const opt = options[key];
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
 * Setzte die Eigenschaften aus dem virtuellen Knoten in die Eigenschaften und Attribute der Komponente ein.
 * @param {NormalizedPropsOptions} propsOptions - Die Web-Komponente
 * @param {RawProps} rawProps - Die unverarbeiteten Eigenschaften aus dem virtuellen Knoten
 * @param {Proxy} props - Die Eigenschaften der Web-Komponente
 * @param {Record<string, *>} attrs - Die Attribute der Web-Komponente
 * @returns {boolean} Wurden Attribute verändert?
 */
function setFullProps(propsOptions, rawProps, props, attrs) {
    let hasAttrsChanged = false;

    if (rawProps) {
        for (const key in rawProps) {
            if (!isReservedProp(key)) {
                const value = rawProps[key];

                if (propsOptions && propsOptions[key]) {
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

    const protoProps = proto.propsOptions;
    const props = normalizePropsOptions(component);

    if (protoProps || props) {
        const normalized = component.propsOptions = {};

        if (protoProps) {
            assign(normalized, protoProps);
        }

        if (props) {
            assign(normalized, props);
        }
    }

    component[FINALIZED] = true;
}

/**
 * Normalisiert die Property Optionen der Komponente.
 * @param {CustomElementConstructor|FunctionConstructor} component - Die Komponente
 * @returns {NormalizedPropsOptions|null} - Die normalisierten Eigenschaften
 */
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
 * Stellt Daten für Kinder-Komponenten bereit.
 * @param {string|symbol} key - Der Schlüssel unter dem die Daten zu finden sind
 * @param {*} value - Die bereitgestellten Daten
 */
export function provide(key, value) {
    if (currentInstance) {
        let provides = currentInstance.provides;

        const parentProvides = currentInstance.parent?.provides;

        if (provides === parentProvides) {
            provides = (currentInstance.provides = Object.create(parentProvides));
        }

        provides[key] = value;
    } else {
        console.warn(`provide() can only be used inside setup().`);
    }
}

/**
 * Holt die Daten mit dem Schlüssel, die von einer Eltern-Komponente bereitgestellt wurden.
 * @param {string|symbol} key - Der Schlüssel
 * @param {*} [defaultValue] - Der Default-Werte, falls keine Daten bereitgestellt wurden
 * @return {*} Die bereitgestellten Daten bzw. der Default-Wert
 */
export function inject(key, defaultValue = null) {
    if (currentInstance) {
        const parentProvides = currentInstance.parent?.provides;

        if (parentProvides && key in parentProvides) {
            return parentProvides[key];
        } else {
            return defaultValue;
        }
    } else {
        console.warn(`inject() can only be used inside setup().`);
    }
}
