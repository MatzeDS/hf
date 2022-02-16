import { COMMENT, COMPONENT, ELEMENT, FRAGMENT, TEXT } from "./vnode.js";
import { isArray, makeMap, EMPTY_OBJ, EMPTY_ARR, isString } from "../shared/utils.js";
import { hyphenate } from "../shared/string.js";
import {
    insert,
    addEventListener,
    removeEventListener,
    removeNode,
    removeFragment,
    nextSibling,
    createComment,
    createElement,
    createText
} from "../shared/dom.js";
import {
    flushPostFlushCallbacks,
    invalidateJob, queuePostFlushCallback
} from "./scheduler.js";

/**
 * Prüft ob das Attribut einen booleschen Wert hat.
 * @type {function(string): boolean}
 */
const isBooleanAttr = makeMap(["readonly", "selected", "checked", "disabled"]);

/**
 * Formatiert den Wert eines booleschen Attributes.
 * @param {*} value - Der Wert
 * @return {boolean} - Der formatierte Wert
 */
const includeBooleanAttr = (value) => !!value || value === "";

/**
 * Prüft ob die Eigenschaft reserviert ist?
 * @type {function(string): boolean}
 */
export const isReservedProp = makeMap(["", "key", "ref"]);

/**
 * Vergleicht zwei virtuelle Knoten miteinander, um zu entscheiden, ob man sie patchen kann.
 * @param {VNode} oldNode - Der late virtuelle Knoten
 * @param {VNode} newNode -  Der neue virtuelle Knoten
 * @return {boolean} Wenn die Knoten gepatcht werden können
 */
export const isSameVNodeType = (oldNode, newNode) =>
    oldNode.type === newNode.type &&
    oldNode.tag === newNode.tag &&
    oldNode.key === newNode.key;

/**
 * Verschiebt das Element des virtuellen Knotens in den Container vor dem Anker
 * @param {VNode} vNode - Der virtuelle Knoten
 * @param {Element} container - Der Container, in das das Element eingefügt wird
 * @param {Node} anchor - Der Anker, vor dem das Element eingefügt werden soll
 */
function move(vNode, container, anchor) {
    const { type, el, children, component } = vNode;

    if (type === FRAGMENT || (type === COMPONENT && component.isFunctional)) {
        insert(el, container, anchor);

        for (let i = 0; i < children.length; i++) {
            move(children[i], container, anchor);
        }

        insert(vNode.anchor, container, anchor);
    } else {
        insert(el, container, anchor);
    }
}

/**
 * Entfernt das Element des virtuellen Knotens.
 * @param {VNode} vNode - Der virtuelle Knoten
 */
const remove = (vNode) => {
    const { type, el, anchor, transition } = vNode;

    if (type === FRAGMENT) {
        removeFragment(el, anchor);
    } else {
        const doRemove = () => {
            removeNode(el);
            transition?.afterLeave?.();
        };

        if (transition) {
            const { leave, delayLeave } = transition;
            const doLeave = () => leave(el, doRemove);

            if (delayLeave) {
                delayLeave(el, removeNode, doLeave);
            } else {
                doLeave();
            }
        } else {
            doRemove();
        }
    }
};


/*
 * Set Functions
 */

/**
 * Setzt den Text eines Knotens.
 * @param {Node} node - Der Knoten
 * @param {string} text - Der Text
 */
const setText = (node, text) => {
    node.nodeValue = text;
};

/**
 * Setzt den Wert eines Styles.
 * @param {CSSStyleDeclaration} style - Die Styledeklaration eines Elements
 * @param {string} name - Der Names des Styles
 * @param {string} value - Der Wert des styles
 */
const setStyle = (style, name, value) => {
    style[name] = value;
};

/**
 * Setzt den Text des Elements.
 * @param {Element} el - Das Element
 * @param {string} text - Der Text
 */
const setElementText = (el, text) => {
    el.textContent = text;
};

/**
 * Gibt den nächsten Nachbarknoten des Elements vom virtuellen Knoten zurück.
 * @param {VNode} vnode - Der virtuelle Knoten
 * @return {ChildNode|null} Der nächste Nachbarknoten
 */
function getNextNode(vnode) {
    return nextSibling(vnode.anchor || vnode.el);
}

/**
 * Bindet die Referenz an das Element des virtuellen Knotens.
 * Wenn es eine alte Referenz gibt, wird diese entfernt.
 * @param {Reference} newRef - Die neue Referenz
 * @param {Reference} oldRef - Die alte Referenz
 * @param {VNode} vNode - Der virtuelle Knoten
 */
const setRef = (newRef, oldRef, vNode) => {
    if (oldRef != null && oldRef !== newRef) {
        oldRef.value = null;
    }

    if (newRef) {
        newRef.value = vNode.el;
    }
};


/*
 * UnMount
 */

/**
 * Entfernt die Web-Komponente des virtuellen Knotens.
 * @param {VNode} vNode - Der virtuelle Knoten
 * @param {WebComponent|null} parentComponent - Das Elternelement
 */
function unmountComponent(vNode, parentComponent) {
    vNode.instance.unmount();
}

/**
 * Entfernt die Elemente der virtuellen Kinderknoten.
 * @param {VNode[]} children - Die virtuellen Kinderknoten
 * @param {WebComponent|null} parentComponent - Das Elternelement
 * @param {number} start - Der Startindex, ab welchem Kinderknoten entfernt werden soll
 */
function unmountChildren(children, parentComponent, start = 0) {
    for (let i = start; i < children.length; i++) {
        unmount(children[i], parentComponent);
    }
}

/**
 * Entfernt das Element des virtuellen Knotens
 * @param {VNode} vNode - Der virtuelle Knoten
 * @param {WebComponent|null} [parentComponent] - Die Elternkomponente
 */
export function unmount(vNode, parentComponent) {
    const { type, children, ref } = vNode;

    if (ref != null) {
        setRef(null, ref, vNode);
    }

    if (type === COMPONENT) {
        unmountComponent(vNode, parentComponent);
    } else {
        if (type === FRAGMENT || isArray(children)) {
            unmountChildren(children, parentComponent);
        }

        remove(vNode);
    }
}


/*
 * Text
 */

/**
 * Verarbeitet virtuelle Text-Knoten
 * @param {VNode|null} oldNode - Der alte virtuelle Knoten
 * @param {VNode} newNode - Der neue virtuelle Knoten
 * @param {Element} container - Der Container, in den der Text eingebunden werden soll
 * @param {Node} anchor - Der Anker, vor dem der Text eingebunden werden soll
 */
function processText(oldNode, newNode, container, anchor) {
    if (oldNode == null) {
        insert((newNode.el = createText(newNode.children)), container, anchor);
    } else {
        const el = (newNode.el = oldNode.el);

        if (newNode.children !== oldNode.children) {
            setText(el, newNode.children);
        }
    }
}


/*
 * Comment
 */

/**
 * Verarbeitet virtuelle Kommentar-Knoten
 * @param {VNode|null} oldNode - Der alte virtuelle Knoten
 * @param {VNode} newNode - Der neue virtuelle Konten
 * @param {Element} container - Der Container, in den der Kommentar eingebunden werden soll
 * @param {Node} anchor - Der Anker, vor dem der Kommentar eingebunden werden soll
 */
function processComment(oldNode, newNode, container, anchor) {
    if (oldNode == null) {
        insert((newNode.el = createComment(newNode.children || "")), container, anchor);
    } else {
        newNode.el = oldNode.el;
    }
}


/*
 * Component
 */

/**
 * Verarbeitet virtuelle Komponenten-Knoten
 * @param {VNode|null} oldNode - Der alte virtuelle Knoten
 * @param {VNode} newNode - Der neue virtuelle Konten
 * @param {Element} container - Der Container, in den die Web-Komponente eingebunden werden soll
 * @param {Node} anchor - Der Anker, vor dem das Element eingebunden werden soll
 * @param {WebComponent|null} parentComponent - Die Elternkomponente
 */
function processComponent(oldNode, newNode, container, anchor, parentComponent) {
    if (oldNode == null) {
        mountComponent(newNode, container, anchor, parentComponent);
    } else {
        patchComponent(oldNode, newNode, parentComponent);
    }
}

/**
 * Erzeugt aus dem virtuellen Knoten eine neue Web-Komponente und bindet diese im Container vor dem Anker ein.
 * @param {VNode} vNode - Der virtuelle Knoten
 * @param {Element} container - Der Container, in den die Web-Komponente eingebunden werden soll
 * @param {Node} anchor - Der Anker, vor dem das Element eingebunden werden soll
 * @param {WebComponent|null} parentComponent - Die Elternkomponente
 */
function mountComponent(vNode, container, anchor, parentComponent) {
    vNode.instance = createComponentInstance(vNode, parentComponent);
    vNode.instance.mount(container, anchor);
}

/**
 * Erzeugt eine neue Instance einer Web-Komponente aus dem virtuellen Knoten.
 * @param {VNode} vNode - Der virtuelle Knoten
 * @param {WebComponent|null} parent - Die Elternkomponente
 */
export function createComponentInstance(vNode, parent) {
    const instance = new vNode.component(vNode.props, parent);
    instance.vnode = vNode;

    return instance;
}

/**
 * Vergleicht den alten virtuellen Knoten mit dem Neuen,
 * um zu entscheiden, ob die Komponente geupdated werden muss.
 * @param {VNode} oldNode - Der alte virtuelle Knoten
 * @param {VNode} newNode - Der neue virtuelle Knoten
 * @returns {boolean} Muss die Komponente geupdated werden?
 */
function shouldUpdateComponent(oldNode, newNode) {
    const oldProps = oldNode.props;
    const newProps = newNode.props;

    if (oldProps === newProps) {
        return false;
    }

    if (!oldProps) {
        return !!newProps;
    }

    if (!newProps) {
        return true;
    }

    const newKeys = Object.keys(newProps);

    if (newKeys.length !== Object.keys(oldProps).length) {
        return true;
    }

    for (const key of newKeys) {
        if (newProps[key] !== oldProps[key]) {
            return true;
        }
    }

    return false;
}

/**
 * Vergleicht zwei virtuelle Komponenten-Knoten miteinander
 * @param {VNode} oldNode - Der alte virtuelle Knoten
 * @param {VNode} newNode - Der neue virtuelle Knoten
 * @param {WebComponent} parentComponent - Die Elternkomponente
 */
function patchComponent(oldNode, newNode, parentComponent) {
    const instance = (newNode.instance = oldNode.instance);

    if (shouldUpdateComponent(oldNode, newNode)) {
        instance._next = newNode;
        invalidateJob(instance.update);
        instance.update();
    } else {
        instance.vnode = newNode;
    }
}


/*
 * Element
 */

/**
 * Verarbeitet virtuelle Element-Knoten
 * @param {VNode|null} oldNode - Der alte virtuelle Knoten
 * @param {VNode} newNode - Der neue virtuelle Knoten
 * @param {Element} container - Der Container, in den das Element eingebunden werden soll
 * @param {Node} anchor - Der Anker, vor dem das Element eingebunden werden soll
 * @param {WebComponent|null} parentComponent - Die Elternkomponente
 * @param {Boolean} isSVG - Ist das Element in einem SVG-Element enthalten
 */
function processElement(oldNode, newNode, container, anchor, parentComponent, isSVG) {
    isSVG = isSVG || (newNode.tag === "svg");

    if (oldNode == null) {
        mountElement(newNode, container, anchor, parentComponent, isSVG);
    } else {
        patchElement(oldNode, newNode, parentComponent, isSVG);
    }
}

/**
 * Bindet das Element aus dem virtuellen Knoten in den Container ein.
 * @param {VNode} vNode - Der virtuelle Knoten
 * @param {Element} container - Der Container, in den das Element eingebunden werden soll
 * @param {Node} anchor - Der Anker, vor dem das Element eingebunden werden soll
 * @param {WebComponent|null} parentComponent - Die Elternkomponente
 * @param {Boolean} isSVG - Ist das Element ein SVG-Element oder in dessen enthalten
 */
function mountElement(vNode, container, anchor, parentComponent, isSVG) {
    const { props, tag, transition } = vNode;
    const el = vNode.el = createElement(tag, isSVG, props?.is);

    if (vNode.children) {
        if (isString(vNode.children)) {
            setElementText(el, vNode.children);
        } else {
            mountChildren(vNode.children, el, null, parentComponent, isSVG);
        }
    }

    if (props) {
        for (const key in props) {
            if (!isReservedProp(key)) {
                patchProp(el, key, null, props[key], isSVG);
            }
        }
    }

    if (transition) {
        transition.beforeEnter(el);
    }

    insert(el, container, anchor);

    if (transition) {
        queuePostFlushCallback(() => {
            transition.enter(el);
        });
    }
}

/**
 * Vergleicht zwei virtuelle Elementknoten miteinander.
 * @param {VNode} oldNode - Der alte virtuelle Knoten
 * @param {VNode} newNode - Der neue virtuelle Knoten
 * @param {WebComponent|null} parentComponent - Die Elternkomponente
 * @param {Boolean} isSVG - Ist das Element ein SVG-Element oder in dessen enthalten
 */
function patchElement(oldNode, newNode, parentComponent, isSVG) {
    const el = (newNode.el = oldNode.el);
    const oldProps = oldNode.props || EMPTY_OBJ;
    const newProps = newNode.props || EMPTY_OBJ;

    patchChildren(oldNode, newNode, el, null, parentComponent, isSVG);
    patchProps(el, oldProps, newProps, isSVG);
}

/**
 * Vergleicht die neuen Eigenschaften mit den Alten des Elements
 * @param {Element} el - Das Element
 * @param {VNodeProps} oldProps - Die alten Eigenschaften
 * @param {VNodeProps} newProps - Die neuen Eigenschaften
 * @param {Boolean} [isSVG] - Ist das Element ein SVG-Element oder in dessen enthalten
 */
export function patchProps(el, oldProps, newProps, isSVG = false) {
    if (oldProps !== newProps) {
        for (const key in newProps) {
            if (!isReservedProp(key)) {
                const newProp = newProps[key];
                const oldProp = oldProps[key];

                if (newProp !== oldProp) {
                    patchProp(el, key, oldProp, newProp, isSVG);
                }
            }
        }

        if (oldProps !== EMPTY_OBJ) {
            for (const key in oldProps) {
                if (!isReservedProp(key) && !(key in newProps)) {
                    patchProp(el, key, oldProps[key], null, isSVG);
                }
            }
        }
    }
}

/**
 * Vergleicht zwei Werte, einer Eigenschaft, eines Elements miteinander
 * @param {Element} el - Das Element
 * @param {string} key - Der Name der Eigenschaft
 * @param {*} oldValue - Der alte Wert
 * @param {*} newValue - Der neue Wert
 * @param {Boolean} [isSVG] - Ist das Element ein SVG-Element oder in dessen enthalten
 */
export function patchProp(el, key, oldValue, newValue, isSVG = false) {
    if (key === "class") {
        patchClass(el, newValue, isSVG);
    } else if (key === "style") {
        patchStyle(el, oldValue, newValue);
    } else if (key.startsWith("on")) {
        patchEvent(el, key, newValue);
    } else {
        patchAttr(el, key, newValue, isSVG);
    }
}

/**
 * Vergleicht die neuen Klassen mit dem des Elements
 * @param {Element} el - Das Element
 * @param {string|null} value - Die Klassen als String
 * @param {Boolean} isSVG - Ist das Element ein SVG-Element oder in dessen enthalten
 */
function patchClass(el, value, isSVG) {
    if (value == null) {
        el.removeAttribute("class");
    } else if (isSVG) {
        el.setAttribute("class", value);
    } else {
        el.className = value;
    }
}

/**
 * Vergleicht den Style für ein Element
 * @param {Element} el - Das Element
 * @param {Record<string, string>|null} oldValue - Der alte Style
 * @param {Record<string, string>|null} newValue - Der neue Style
 */
function patchStyle(el, oldValue, newValue) {
    const style = el.style;

    if (newValue) {
        for (const key in newValue) {
            setStyle(style, key, newValue[key]);
        }

        if (oldValue) {
            for (const key in oldValue) {
                if (newValue[key] == null) {
                    setStyle(style, key, "");
                }
            }
        }
    } else {
        el.removeAttribute("style");
    }
}

/**
 * Vergleicht den übergebenen Event-Listener mit der aus dem Element.
 * @param {Element} el - Das Element
 * @param {string} name - Der Name des Events
 * @param {EventListener} newValue - Der Event-Listener
 */
function patchEvent(el, name, newValue) {
    const ve = el._ve || (el._ve = {});
    const on = ve[name];

    if (newValue && on) {
        on.value = newValue;
    } else {
        const event = hyphenate(name.slice(2));

        if (newValue) {
            const handler = ve[name] = (evt) => evt.detail
                ? handler.value(evt.detail.data, evt)
                : handler.value(evt);

            handler.value = newValue;
            addEventListener(el, event, handler);
        } else {
            removeEventListener(el, event, on);
            ve[name] = undefined;
        }
    }
}

/**
 * Vergleicht das übergebene Attribut mit dem Attributwert des Elements.
 * @param {Element} el - Das Element
 * @param {string} key - Das Schlüsselwort des Attributes
 * @param {*} value - Der Wert des Attributes
 * @param {Boolean} isSVG - Ist das Element ein SVG-Element oder in dessen enthalten
 */
function patchAttr(el, key, value, isSVG) {
    const isBoolean = isBooleanAttr(key);

    if (value == null || (isBoolean && !includeBooleanAttr(value))) {
        el.removeAttribute(key);
    } else {
        el.setAttribute(key, isBoolean ? "" : value);
    }
}


/*
 * Fragment
 */

/**
 * Vergleicht zwei Fragment virtuelle Knoten.
 * @param {VNode|null} oldNode - Der alte virtuelle Knoten
 * @param {VNode} newNode - Der neue virtuelle Knoten
 * @param {Element} container - Der Container, in dem die Kinder verglichen werden
 * @param {Node} anchor - Der Ankerknoten, vor dem die Knoten eingefügt werden sollen
 * @param {WebComponent|null} parentComponent - Die Elternkomponente
 * @param {Boolean} isSVG - Ist das Fragment in einem SVG-Element enthalten
 */
function processFragment(oldNode, newNode, container, anchor, parentComponent, isSVG) {
    const fragmentStartAnchor = (newNode.el = oldNode ? oldNode.el : createText(""));
    const fragmentEndAnchor = (newNode.anchor = oldNode ? oldNode.anchor : createText(""));

    if (oldNode == null) {
        insert(fragmentStartAnchor, container, anchor);
        insert(fragmentEndAnchor, container, anchor);

        mountChildren(newNode.children, container, fragmentEndAnchor, parentComponent, isSVG);
    } else {
        patchChildren(oldNode, newNode, container, fragmentEndAnchor, parentComponent, isSVG);
    }
}

/**
 * Fügt die Kinder in den Container, vor dem Anker ein
 * @param {VNode[]} children - Die virtuellen Kinderknoten
 * @param {Element} container - Der Container, in dem die Kinder verglichen werden
 * @param {Node} anchor - Der Ankerknoten, vor dem die Knoten eingefügt werden sollen
 * @param {WebComponent|null} parentComponent - Die Elternkomponente
 * @param {Boolean} [isSVG] - Sind die Kinder innerhalb eines SVG-Elements
 * @param {number} [start] - Der Startindex, ab welchem Kinder diese eingebunden werden sollen
 */
function mountChildren(children, container, anchor, parentComponent, isSVG = false, start = 0) {
    for (let i = start; i < children.length; i++) {
        const child = children[i];
        patch(null, child, container, anchor, parentComponent, isSVG);
    }
}

/**
 * Vergleicht die Kinder von zwei virtuellen Knoten miteinander
 * @param {VNode|null} oldNode - Der alte virtuelle Knoten
 * @param {VNode} newNode - Der neue virtuelle Knoten
 * @param {Element} container - Der Container, in dem die virtuellen Knoten verglichen werden
 * @param {Node} anchor - Der Ankerknoten, vor dem der Knoten eingefügt werden soll
 * @param {WebComponent|null} parentComponent - Die Elternkomponente
 * @param {Boolean} isSVG - Sind die Kinder in einem SVG-Element enthalten
 */
function patchChildren(oldNode, newNode, container, anchor, parentComponent, isSVG) {
    const oldChildren = oldNode?.children;
    const newChildren = newNode.children;

    if (isArray(oldChildren)) {
        if (isArray(newChildren)) {
            patchKeyedChildren(oldChildren, newChildren, container, anchor, parentComponent, isSVG);
        } else {
            unmountChildren(oldChildren, parentComponent);
        }
    } else {
        if (oldChildren && isString(newChildren)) {
            setElementText(container, newChildren);
        }

        if (isArray(newChildren)) {
            mountChildren(newChildren, container, anchor, parentComponent, isSVG);
        }
    }
}


/*
 * Patch Functions
 */

/**
 * Vergleicht zwei virtuelle Knoten miteinander
 * @param {VNode|null} oldNode - Der alte virtuelle Knoten
 * @param {VNode} newNode - Der neue virtuelle Knoten
 * @param {Element} container - Der Container, in dem die virtuellen Knoten verglichen werden
 * @param {Node|null} anchor - Der Ankerknoten, vor dem der Knoten eingefügt werden soll
 * @param {WebComponent|null} parentComponent - Die Elternkomponente
 * @param {Boolean} isSVG - Ist das Element in einem SVG-Element enthalten
 */
export function patch(oldNode, newNode, container, anchor = null, parentComponent = null, isSVG = false) {
    if (oldNode === newNode) {
        return;
    }

    if (oldNode && !isSameVNodeType(oldNode, newNode)) {
        anchor = getNextNode(oldNode);
        unmount(oldNode, parentComponent);
        oldNode = null;
    }

    switch (newNode.type) {
        case TEXT:
            processText(oldNode, newNode, container, anchor);
            break;
        case COMMENT:
            processComment(oldNode, newNode, container, anchor);
            break;
        case FRAGMENT:
            processFragment(oldNode, newNode, container, anchor, parentComponent, isSVG);
            break;
        case ELEMENT:
            processElement(oldNode, newNode, container, anchor, parentComponent, isSVG);
            break;
        case COMPONENT:
            processComponent(oldNode, newNode, container, anchor, parentComponent);
            break;
    }
}


/**
 * Vergleicht zwei Listen von virtuellen Kinderknoten miteinander.
 * @param {VNode[]} oldChildren - Die alten virtuellen Kinderknoten
 * @param {VNode[]} newChildren - Die neuen virtuellen Kinderknoten
 * @param {Element} container - Der Container, in dem die virtuellen Kinderknoten verglichen werden
 * @param {Node} parentAnchor - Der Ankerknoten, vor dem die Kinderknoten eingefügt werden soll
 * @param {WebComponent} parentComponent - Die Elternkomponente
 * @param {Boolean} isSVG - Sind die Kinder in einem SVG-Element enthalten
 */
function patchKeyedChildren(oldChildren, newChildren, container, parentAnchor, parentComponent, isSVG) {
    let i = 0;
    const l2 = newChildren.length;
    let e1 = oldChildren.length - 1;
    let e2 = l2 - 1;

    // Schleife vorwärts, bis Unterschied zwischen oldChildren und newChildren
    while (i <= e1 && i <= e2) {
        const oldNode = oldChildren[i];
        const newNode = newChildren[i];

        if (isSameVNodeType(oldNode, newNode)) {
            patch(oldNode, newNode, container, null, parentComponent, isSVG);
        } else {
            break;
        }

        i++;
    }

    // Schleife von hinten durchlaufen, bis Unterschied zwischen oldChildren und newChildren
    while (i <= e1 && i <= e2) {
        const oldNode = oldChildren[e1];
        const newNode = newChildren[e2];

        if (isSameVNodeType(oldNode, newNode)) {
            patch(oldNode, newNode, container, null, parentComponent, isSVG);
        } else {
            break;
        }

        e1--;
        e2--;
    }

    // Wenn alle Element von oldChildren gepatcht wurden
    if (i > e1) {
        // aber es noch Elemente in newChildren gibt
        if (i <= e2) {
            // Die Position des letzten gemeinsamen Elements von newChildren, wenn von hinten gemeinsame Elemente gepatcht
            // wurden sind oder wenn von hinten keine gemeinsamen Elemente gepatcht wurden, die Anzahl der Elemente in newChildren
            const newPos = e2 + 1;
            // Das letzte von hinten gepatchte Element oder der übergebene Anchor (Default: null)
            const anchor = newPos < l2 ? newChildren[newPos].el : parentAnchor;

            // werden diese ab dem letzten übereinstimmenden Element eingefügt
            while (i <= e2) {
                patch(null, newChildren[i], container, anchor, parentComponent, isSVG);
                i++;
            }
        }
    // Wenn oldChildren größer als newChildren ist werden die ungleichen nicht gepatchten Elemente (zwischen i und e1) aus oldChildren entfernt
    } else if (i > e2) {
        while (i <= e1) {
            unmount(oldChildren[i], parentComponent);
            i++;
        }
    // Wenn es Unterschiede zwischen oldChildren und newChildren gibt, die in Beiden enthalten sind
    } else {
        const s1 = i;
        const s2 = i;

        // Falls Keys für die virtuellen Knoten von newChildren vergeben wurden,
        // wenden diese hier gespeichert mit der Position
        const keyToNewIndexMap = new Map();

        for (i = s2; i <= e2; i++) {
            const newChild = newChildren[i];

            if (newChild.key != null) {
                keyToNewIndexMap.set(newChild.key, i);
            }
        }

        let j;
        let patched = 0;
        // Anzahl der Knoten aus newChildren die noch nicht gepatcht wurden
        const toBePatched = e2 - s2 + 1;
        let moved = false;
        let maxNewIndexSoFar = 0;
        const newIndexToOldIndexMap = new Array(toBePatched);

        // Initialisieren der Map
        for (i = 0; i < toBePatched; i++) {
            newIndexToOldIndexMap[i] = 0;
        }

        // Iterieren über die noch nicht gepatchten Knoten aus oldChildren
        for (i = s1; i <= e1; i++) {
            const oldChild = oldChildren[i];

            // Wenn schon alle Knoten aus newChildren gepatcht oder erzeugt worden sind
            if (patched >= toBePatched) {
                unmount(oldChild, parentComponent);
            } else {
                let newIndex;

                // Wenn ein Key für den alten Knoten vergeben wurde
                if (oldChild.key != null) {
                    newIndex = keyToNewIndexMap.get(oldChild.key);
                } else {
                    // Iterieren über die neuen Knoten aus newChildren um einen passenden Knoten zu finden
                    for (j = s2; j <= e2; j++) {
                        // Wenn in der Map der Wert 0 steht, wurde dieser Knoten aus newChildren noch nicht gepatcht und
                        // der Knoten aus oldChildren zum Knoten aus newChildren vom Typ her passt
                        if (newIndexToOldIndexMap[j - s2] === 0 && isSameVNodeType(oldChild, newChildren[j])) {
                            newIndex = j;
                            break;
                        }
                    }
                }

                // Wenn kein passender Knoten gefunden wurde
                if (newIndex === undefined) {
                    unmount(oldChild, parentComponent);
                } else {
                    // Die Position vom alten Knoten aus oldChildren wird in der Map für den neuen Knoten gespeichert
                    newIndexToOldIndexMap[newIndex - s2] = i + 1;

                    if (newIndex >= maxNewIndexSoFar) {
                        maxNewIndexSoFar = newIndex;
                    } else {
                        // Wenn der neue Index kleiner als der bisherige maximale Index ist,
                        // müssen die Knoten bewegt werden, um die Reihenfolge von newChildren herzustellen
                        moved = true;
                    }

                    // Hier werden die passenden Knoten miteinander gepatcht, aber noch nicht bewegt
                    patch(oldChild, newChildren[newIndex], container, null, parentComponent, isSVG);
                    patched++;
                }
            }
        }

        // Wenn Knoten bewegt werden müssen, dann wird die längste Sequenz aufsteigender Indizes aus
        // der Liste der gepatchten Knoten ermittelt
        const increasingNewIndexSequence = moved ? getSequence(newIndexToOldIndexMap) : EMPTY_ARR;

        // Der Index des letzten Knotens aus der Sequenz
        let sequenceLastIndex = increasingNewIndexSequence.length - 1;

        // Iteriert über die zu bearbeitenden Knoten aus newChildren
        for (i = toBePatched - 1; i >= 0; i--) {
            // Index für newChildren
            const newIndex = s2 + i;
            // Knoten aus newChildren
            const newChild = newChildren[newIndex];
            // Wenn es in der Liste newChildren nach newChild einen weiteren Knoten gibt, wird dieser als Anker verwendet,
            // sonst der parent Anker (Default: null)
            const anchor = newIndex + 1 < l2 ? newChildren[newIndex + 1].el : parentAnchor;

            // Wenn der Knoten aus newChildren nicht gepatcht wurde, wird dieser erstellt
            if (newIndexToOldIndexMap[i] === 0) {
                patch(null, newChild, container, anchor, parentComponent, isSVG);
            // Wenn es Knoten gibt die verschoben werden müssen
            } else if (moved) {
                // dann, wenn alle Elemente der Sequenz bearbeitet wurden oder der Knoten nicht in der Sequenz enthalten ist
                // (Der Knoten ist nicht in der aufsteigenden Reihenfolge enthalten und somit an falscher Position in newChildren)
                // (sequenceLastIndex < 0: Alle Knoten müssen bewegt werden, da es keine Sequenz gibt, welche die statischen Positionen enthält)
                if (sequenceLastIndex < 0 || i !== increasingNewIndexSequence[sequenceLastIndex]) {
                    move(newChild, container, anchor);
                } else {
                    sequenceLastIndex--;
                }
            }
        }
    }
}

/**
 * Gibt die längste aufsteigende Sequenz zurück.
 * @param {number[]} arr - Eine Liste Zahlen
 * @return {number[]} Die längste aufsteigende Sequenz
 */
function getSequence(arr) {
    const p = arr.slice();
    const result = [0];
    let i, j, u, v, c;
    const len = arr.length;

    for (i = 0; i < len; i++) {
        const arrI = arr[i];

        if (arrI !== 0) {
            j = result[result.length - 1];

            if (arr[j] < arrI) {
                p[i] = j;
                result.push(i);
                continue;
            }

            u = 0;
            v = result.length - 1;

            while (u < v) {
                c = (u + v) >> 1;

                if (arr[result[c]] < arrI) {
                    u = c + 1;
                } else {
                    v = c;
                }
            }

            if (arrI < arr[result[u]]) {
                if (u > 0) {
                    p[i] = result[u - 1];
                }

                result[u] = i;
            }
        }
    }

    u = result.length;
    v = result[u - 1];

    while (u-- > 0) {
        result[u] = v;
        v = p[v];
    }

    return result;
}

/**
 * Rendert den virtuellen Knoten mit seinen Kindern im Container.
 * @param {VNode|null} vNode - Der virtuelle Knoten
 * @param {Element} container - Der Container, in dem der virtuellen Knoten gerendert wird
 * @param {Boolean} isSVG - Ist der Container ein SVG-Element oder in einem enthalten
 */
export function render(vNode, container, isSVG) {
    if (vNode == null) {
        if (container._vnode) {
            unmount(container._vnode);
        }
    } else {
        patch(container._vnode || null, vNode, container, null, isSVG);
    }

    flushPostFlushCallbacks();
    container._vnode = vNode;
}
