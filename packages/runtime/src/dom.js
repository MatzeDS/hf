
/**
 * Fügt ein Kindsknoten in ein Elternknoten ein, wenn ein Anker definiert wurde,
 * wird das Element vor diesem eingefügt, sonst wird der Knoten am ender eingefügt.
 * @param {Node} child - Der Kindsknoten
 * @param {Element} parent - Der Elternknoten
 * @param {Node} [anchor] - Der Anker
 */
export const insert = (child, parent, anchor) => {
    parent.insertBefore(child, anchor || null);
};

/**
 * Gibt den nächsten Nachbarknoten, des übergebenen Knoten zurück.
 * @param {Node} node - Der Knoten
 * @return {ChildNode|null} Der nächste Knoten, falls vorhanden
 */
export const nextSibling = node => node.nextSibling;

/**
 * Entfernt die Klasse vom Element.
 * @param {Element} el - Das Element
 * @param {string} cls - Die Klasse
 */
export const removeClass = (el, cls) => {
    el.classList.remove(cls);
};

/**
 * Fügt die Klasse dem Element hinzu.
 * @param {Element} el - Das Element
 * @param {string} cls - Die Klasse
 */
export const addClass = (el, cls) => {
    el.classList.add(cls);
};

/**
 * Fügt ein Event-Listener zum Element hinzu
 * @param {Element} el - Das Element
 * @param {string} event - Das Event
 * @param {EventListenerOrEventListenerObject} handler - Der hinzufügende Listener
 * @param {Boolean|AddEventListenerOptions} [options] - Optionen für den Event-Listener
 */
export const addEventListener = (el, event, handler, options) => {
    el.addEventListener(event, handler, options);
};

/**
 * Entfernt ein Event-Listener vom Element
 * @param {Element} el - Das Element
 * @param {string} event - Das Event
 * @param {EventListenerOrEventListenerObject} handler - Der zu entfernende Listener
 * @param {Boolean|EventListenerOptions} [options] - Optionen für den Event-Listener
 */
export const removeEventListener = (el, event, handler, options) => {
    el.removeEventListener(event, handler, options);
};

/**
 * Entfernt alle Knoten des Fragments, indem vom ersten Kinderknoten bis zum Ende alle entfernt werden.
 * @param {Node} node - Der anfangsknoten Knoten im Fragment
 * @param {Node} end - Der letzte Knoten im Fragment
 */
export const removeFragment = (node, end) => {
    let next;

    while (node !== end) {
        next = nextSibling(node);
        removeNode(node);
        node = next;
    }

    removeNode(end);
};

/**
 * Entfernt den Knoten von seinem aktuellen Parent.
 * @param {Node|Element|BaseComponent} node - Der Knoten
 */
export const removeNode = (node) => {
    const parent = node.parentNode;

    if (parent) {
        parent.removeChild(node);
    }
};


/*
 * Create Functions
 */

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/**
 * Erzeugt ein HTML Element vom übergebenen Tag
 * @param {string} tag - Der Tag des Elements
 * @param {boolean} isSVG - Ist das Element ein SVG oder in einem SVG
 * @param {string} [is] - Ist das Element ein Build-in Element
 * @return {Element} Das erzeugte Element
 */
export const createElement = (tag, isSVG, is) => {
    return isSVG
        ? document.createElementNS(SVG_NAMESPACE, tag)
        : document.createElement(tag, is ? { is } : undefined);
};

/**
 * Erzeugt einen Textknoten
 * @param {string} text - Der Text
 * @return {Text} Der erzeugte Textknoten
 */
export const createText = text => document.createTextNode(text);

/**
 * Erzeugt einen HTML Kommentar
 * @param {string} text - Der kommentartext
 * @return {Comment} Der erzeugte Kommentar
 */
export const createComment = text => document.createComment(text);
