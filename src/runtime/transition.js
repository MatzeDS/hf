import { nextTick, isArray } from "../shared/utils.js";
import { addClass, removeClass } from "../shared/dom.js";
import { isSameVNodeType } from "./renderer.js";
import { COMMENT } from "./vnode.js";
import {
    FunctionalComponent,
    onBeforeUnmount,
    onMounted,
    registerComponent
} from "./component.js";

/**
 * Die Art der Transition, entweder eine CSS Transition oder CSS Animation.
 * @typedef {"transition"|"animation"} EventType
 */

/**
 * Der Status der Transition.
 * @typedef {Object} TransitionState
 * @property {boolean} isMounted - Ist die Transition gemounted
 * @property {boolean} isUnmounting - Ist die Transition geunmounted
 * @property {boolean} isLeaving - Das Element der Transition wird gerade entfernt
 * @property {Map<symbol, Record<string, VNode>>} leavingVNodes - Die virtuellen Knoten, die aktuellen entfernt werden
 */

/**
 * Die Modi der Transition.
 * @typedef {"out-in", "in-out", "default"} TransitionMode
 */

/**
 * Ein Transition Hook bekommt das Element welches transitiert übergeben.
 * @typedef {function(el: Element): void} TransitionHook
 */

/**
 * Die Hooks der Transition für den virtuellen Knoten.
 * @typedef {Object} VNodeTransitionHooks
 * @property {TransitionMode} mode - Der Modus der Transition
 * @property {function(el: Element): void} beforeEnter - Dieser Hook wird vor dem Einfügen des Elements aufgerufen
 * @property {function(el: Element): void} enter - Dieser Hook wird nach dem Einfügen des Elements aufgerufen
 * @property {function(el: Element, remove: function(): void): void} leave - Dieser Hook wird vor dem Entfernen aufgerufen
 * @property {function(el: Element, remove: function(): void, delayedLeave: function(): void): void} [delayLeave] - Führt verzögert das Entfernen des Elements aus
 * @property {function(): void} [delayedLeave] - Entfernt das Element nach der Verzögerung
 * @property {function(VNode): VNodeTransitionHooks} clone - Erzeugt eine Kopie der Transition Hooks
 */

/**
 * Die Optionen für die Transition.
 * @typedef {Object} TransitionProperties
 * @property {string} [mode] - Der Modus der Transition
 * @property {string} [name] - Der Name der Transition
 * @property {EventType} [event] - Die Art der Transition (transition/animation)
 * @property {boolean} [appear] - Beim Einbinden animieren
 * @property {number|number[]} [duration] - Eine fest definierte Zeit für die Transition in Sekunden
 * @property {string} [enterFromClass] - Klasse für den Start-Zustand der Enter-Transition (Default: `${name}--enter-from`)
 * @property {string} [enterActiveClass] - Klasse für eine aktive Enter-Transition (Default: `${name}--enter-active`)
 * @property {string} [enterToClass] - Klasse für den Ziel-Zustand der Enter-Transition (Default: `${name}--enter-to`)
 * @property {string} [leaveFromClass] - Klasse für den Start-Zustand der Leave-Transition (Default: `${name}--leave-from`)
 * @property {string} [leaveActiveClass] - Klasse für eine aktive Leave-Transition (Default: `${name}--leave-active`)
 * @property {string} [leaveToClass] - Klasse für den Ziel-Zustand der Leave-Transition (Default: `${name}--leave-to`)
 * @property {TransitionHook|TransitionHook[]} [onBeforeEnter] - Ein Hook, der aufgerufen wird, bevor die enter-Transition startet
 * @property {TransitionHook|TransitionHook[]} [onEnter] - Ein Hook, der aufgerufen wird, wenn die enter-Transition gestartet wurde
 * @property {TransitionHook|TransitionHook[]} [onAfterEnter] - Ein Hook, der aufgerufen wird, nachdem die enter-Transition beendet wurde
 * @property {TransitionHook|TransitionHook[]} [onEnterCancelled] - Ein Hook, der aufgerufen wird, falls die enter-Transition unterbrochen wird
 * @property {TransitionHook|TransitionHook[]} [onBeforeLeave] - Ein Hook, der aufgerufen wird, bevor die leave-Transition startet
 * @property {TransitionHook|TransitionHook[]} [onLeave] - Ein Hook, der aufgerufen wird, wenn die leave-Transition gestartet wurde
 * @property {TransitionHook|TransitionHook[]} [onAfterLeave] - Ein Hook, der aufgerufen wird, nachdem die leave-Transition beendet wurde
 * @property {TransitionHook|TransitionHook[]} [onLeaveCancelled] - Ein Hook, der aufgerufen wird, falls die leave-Transition unterbrochen wird
 */

/**
 * Eine CSS Transition
 * @type {EventType}
 */
const TRANSITION = "transition";

/**
 * Eine CSS Animation
 * @type {EventType}
 */
const ANIMATION = "animation";

/**
 * Die Basis Transition um zwischen Elementen zu wechseln.
 * @extends FunctionalComponent
 */
export default class BaseTransition extends FunctionalComponent {
    static tag = "base-transition";

    static props() {
        return {
            mode: {
                type: String,
                default: "default"
            },
            name: {
                type: String,
                default: TRANSITION
            },
            event: {
                type: String,
                default: TRANSITION
            },
            appear: Boolean,
            duration: [Number, Array],
            onBeforeEnter: Function,
            onEnter: Function,
            onAfterEnter: Function,
            onEnterCancelled: Function,
            onBeforeLeave: Function,
            onLeave: Function,
            onAfterLeave: Function,
            onLeaveCancelled: Function,
            enterFromClass: String,
            enterActiveClass: String,
            enterToClass: String,
            leaveFromClass: String,
            leaveActiveClass: String,
            leaveToClass: String
        };
    }

    setup(props) {
        const state = {
            isMounted: false,
            isUnmounting: false,
            isLeaving: false,
            leavingVNodes: new Map()
        };

        onMounted(() => {
            state.isMounted = true;
        });

        onBeforeUnmount(() => {
            state.isUnmounting = true;
        });

        const [ enterDuration, leaveDuration ] = normalizeDuration(props.duration);

        const enterFromClass = props.enterFromClass || `${props.name}--enter-from`;
        const enterActiveClass = props.enterActiveClass || `${props.name}--enter-active`;
        const enterToClass = props.enterToClass || `${props.name}--enter-to`;
        const leaveFromClass = props.leaveFromClass || `${props.name}--leave-from`;
        const leaveActiveClass = props.leaveActiveClass || `${props.name}--leave-active`;
        const leaveToClass = props.leaveToClass || `${props.name}--leave-to`;

        const {
            mode,
            type,
            onBeforeEnter,
            onEnter,
            onAfterEnter,
            onEnterCancelled,
            onBeforeLeave,
            onLeave,
            onAfterLeave,
            onLeaveCancelled,
        } = props;

        const finishEnter = (el, done) => {
            removeClass(el, enterToClass);
            removeClass(el, enterActiveClass);
            done && done();
        };

        const finishLeave = (el, done) => {
            removeClass(el, leaveToClass);
            removeClass(el, leaveActiveClass);
            done && done();
        };

        return {
            mode,
            state,
            onBeforeEnter(el) {
                triggerHook(onBeforeEnter, [el]);
                addClass(el, enterFromClass);
                addClass(el, enterActiveClass);
            },
            onEnter(el, done) {
                const resolve = () => finishEnter(el, done);
                triggerHook(onEnter, [el, resolve]);

                nextTick(() => {
                    removeClass(el, enterFromClass);
                    addClass(el, enterToClass);
                    whenTransitionEnds(el, type, enterDuration, resolve);
                });
            },
            onAfterEnter,
            onEnterCancelled(el) {
                finishEnter(el);
                triggerHook(onEnterCancelled, [el]);
            },
            onBeforeLeave,
            onLeave(el, done) {
                const resolve = () => finishLeave(el, done);
                addClass(el, leaveFromClass);
                document.body.offsetHeight;
                addClass(el, leaveActiveClass);

                nextTick(() => {
                    removeClass(el, leaveFromClass);
                    addClass(el, leaveToClass);
                    whenTransitionEnds(el, type, leaveDuration, resolve);
                });

                triggerHook(onLeave, [el, resolve]);
            },
            onAfterLeave,
            onLeaveCancelled(el) {
                finishLeave(el);
                triggerHook(onLeaveCancelled, [el]);
            }
        };
    }

    render(data, { slots, instance }) {
        const {
            state,
            mode
        } = data;

        let children = slots.default?.();

        if (!children || state.isLeaving) {
            return;
        }

        const child = isArray(children) ? children[0] : children;

        if (!child) {
            return;
        }

        const enterHooks = child.transition = resolveTransitionHooks(child, data);

        children = instance._subTree?.children;
        const oldChild = isArray(children) ? children[0] : children;

        if (oldChild && oldChild.type !== COMMENT && !isSameVNodeType(child, oldChild)) {
            const leavingHooks = oldChild.transition = resolveTransitionHooks(oldChild, data);

            if (mode === "out-in") {
                state.isLeaving = true;

                leavingHooks.afterLeave = () => {
                    state.isLeaving = false;
                    instance.update();
                };

                return;
            } else if (mode === "in-out" && child.type !== COMMENT) {
                leavingHooks.delayLeave = (el, remove, delayedLeave) => {
                    const leavingVNodes = getLeavingVNodes(state, oldChild);

                    leavingVNodes[String(oldChild.key)] = oldChild;

                    el._leaveCb = () => {
                        remove();
                        el._leaveCb = undefined;
                        delete enterHooks.delayedLeave;
                    };

                    enterHooks.delayedLeave = delayedLeave;
                };
            }
        }

        return child;
    }
}

registerComponent(BaseTransition);

/**
 * Erzeugt Hooks einer Transition für einen virtuellen Knoten, der durch diese animiert wird.
 * @param {VNode} vNode - Der virtuelle Knoten
 * @param {Object} data - Die Daten der Transition
 * @returns {VNodeTransitionHooks}
 */
function resolveTransitionHooks(vNode, data) {
    const {
        mode,
        appear,
        state,
        onBeforeEnter,
        onEnter,
        onAfterEnter,
        onEnterCancelled,
        onBeforeLeave,
        onLeave,
        onAfterLeave,
        onLeaveCancelled
    } = data;

    const key = String(vNode.key);
    const leavingVNodes = getLeavingVNodes(state, vNode);

    /**
     * @type {VNodeTransitionHooks}
     */
    const hooks = {
        mode,
        beforeEnter(el) {
            if (!state.isMounted && !appear) {
                return;
            }

            if (el._leaveCb) {
                el._leaveCb(true);
            }

            const leavingVNode = leavingVNodes[key];

            if (leavingVNode && isSameVNodeType(vNode, leavingVNode) && leavingVNode.el?._leaveCb) {
                leavingVNode.el._leaveCb();
            }

            triggerHook(onBeforeEnter, [el]);
        },
        enter(el) {
            if (!state.isMounted && !appear) {
                return;
            }

            let called = false;

            const done = el._enterCb = cancelled => {
                if (called) {
                    return;
                }

                called = true;

                if (cancelled) {
                    triggerHook(onEnterCancelled, [el]);
                } else {
                    triggerHook(onAfterEnter, [el]);
                }

                if (hooks.delayedLeave) {
                    hooks.delayedLeave();
                }

                el._enterCb = undefined;
            };

            if (onEnter) {
                onEnter(el, done);

                if (onEnter.length <= 1) {
                    done();
                }
            } else {
                done();
            }
        },
        leave(el, remove) {
            const key = String(vNode.key);

            if (el._enterCb) {
                el._enterCb(true);
            }

            if (state.isUnmounting) {
                return remove();
            }

            triggerHook(onBeforeLeave, [el]);

            let called = false;

            const done = el._leaveCb = cancelled => {
                if (called) {
                    return;
                }

                called = true;
                remove();

                if (cancelled) {
                    triggerHook(onLeaveCancelled, [el]);
                } else {
                    triggerHook(onAfterLeave, [el]);
                }

                el._leaveCb = undefined;

                if (leavingVNodes[key] === vNode) {
                    delete leavingVNodes[key];
                }
            };

            leavingVNodes[key] = vNode;

            if (onLeave) {
                onLeave(el, done);

                if (onLeave.length <= 1) {
                    done();
                }
            } else {
                done();
            }
        },
        clone(vNode) {
            return resolveTransitionHooks(vNode, data);
        }
    };

    return hooks;
}

/**
 * Gibt die Knoten der Transition zurück, welche gerade entfernt wurden und
 * mit dem Typ des virtuellen Knotens übereinstimmen.
 * @param {TransitionState} state - Der Status der Transition
 * @param {VNode} vNode - Der virtuelle Knoten
 * @returns {Record<string, VNode>} Die virtuellen Knoten abhängig vom Schlüssel
 */
function getLeavingVNodes(state, vNode) {
    const { leavingVNodes } = state;
    let typedVNodes = leavingVNodes.get(vNode.type);

    if (!typedVNodes) {
        typedVNodes = {};
        leavingVNodes.set(vNode.type, typedVNodes);
    }

    return typedVNodes;
}

/**
 * Hilfsfunktion zum Aufruf einer oder mehrerer Hooks.
 * @param {TransitionHook|TransitionHook[]} hook - Die Hooks
 * @param {Array} args - Argumente für die Hooks
 */
function triggerHook(hook, args) {
    if (hook) {
        if (isArray(hook)) {
            hook.forEach(h => h(...args));
        } else {
            hook(...args);
        }
    }
}

/**
 * Normalisiert die Duration, gibt enter- und leave-Duration getrennt zurück.
 * @param {number|number[]} duration - Die unformatierte Duration
 * @returns {[number|null, number|null]} - enter- und leave-Duration
 */
function normalizeDuration(duration) {
    if (isArray(duration)) {
        if (duration.length === 2) {
            return duration;
        }

        duration = duration[0];
    }

    duration = duration || null;

    return [ duration, duration ];
}

/**
 * Gibt die Zeit in Millisekunden zurück.
 * @param {string} s - Zeit-String in Sekunden
 * @returns {number} Zeit in Millisekunden
 */
function toMs(s) {
    return Number(s.slice(0, -1)) * 1000;
}

/**
 * Gibt den Timeout abhängig von Verzögerungen und Dauer an
 * @param {string[]} delays - Die Verzögerungen der Transitionen
 * @param {string[]} durations - Die Dauer der Transitionen
 * @returns {number} Der maximale Timeout
 */
function getTimeout(delays, durations) {
    let associatedDelays = delays;

    while (associatedDelays.length < durations.length) {
        associatedDelays = associatedDelays.concat(associatedDelays);
    }

    return Math.max(...durations.map((d, i) => toMs(d) + toMs(associatedDelays[i])));
}

/**
 * Gibt die Informationen der Transitionen zurück.
 * @param {Element} elem - Das Element, welches transitiert
 * @param {string} [expectedType] - Der Typ der Transition (transition/animation)
 * @returns {{ propCount: number, type: string|null, timeout: number }}
 */
function getTransitionInfo(elem, expectedType) {
    const styles = window.getComputedStyle(elem);

    const getStyleProperties = (key) => (styles[key] || "").split(", ");

    const transitionDelays = getStyleProperties(TRANSITION + "Delay");
    const transitionDurations = getStyleProperties(TRANSITION + "Duration");
    const transitionTimeout = getTimeout(transitionDelays, transitionDurations);
    const animationDelays = getStyleProperties(ANIMATION + "Delay");
    const animationDurations = getStyleProperties(ANIMATION + "Duration");
    const animationTimeout = getTimeout(animationDelays, animationDurations);

    let type = null;
    let timeout = 0;
    let propCount = 0;

    if (expectedType === TRANSITION) {
        if (transitionTimeout > 0) {
            type = TRANSITION;
            timeout = transitionTimeout;
            propCount = transitionDurations.length;
        }
    } else if (expectedType === ANIMATION) {
        if (animationTimeout > 0) {
            type = ANIMATION;
            timeout = animationTimeout;
            propCount = animationDurations.length;
        }
    } else {
        timeout = Math.max(transitionTimeout, animationTimeout);

        if (timeout > 0) {
            type = transitionTimeout > animationTimeout
                ? TRANSITION
                : ANIMATION;

            propCount = type === TRANSITION
                ? transitionDurations.length
                : animationDurations.length;
        }
    }

    return {
        type,
        timeout,
        propCount
    };
}

let endId = 0;

/**
 * Wenn die Transition endet, wird die Resolve-Funktion aufgerufen
 * @param {Element} elem - Das Element, welches transitiert
 * @param {string|null} expectedType - Der Typ der Transition (transition/animation)
 * @param {number|null} explicitTimeout - Eine fest definierte Zeit für die Transition
 * @param {function(): void} resolve - Resolve-Funktion, wenn die Funktion beendet ist
 */
function whenTransitionEnds(elem, expectedType, explicitTimeout, resolve) {
    const id = (elem._endId = ++endId);

    const resolveIfNotStale = () => {
        if (id === elem._endId) {
            resolve();
        }
    };

    if (explicitTimeout) {
        return setTimeout(resolveIfNotStale, explicitTimeout);
    }

    const { type, timeout, propCount } = getTransitionInfo(elem, expectedType);

    if (!type) {
        return resolve();
    }

    const endEvent = type + "end";
    let ended = 0;

    const end = () => {
        elem.removeEventListener(endEvent, onEnd);
        resolveIfNotStale();
    };

    const onEnd = (evt) => {
        if (evt.target === elem && ++ended >= propCount) {
            end();
        }
    };

    setTimeout(() => {
        if (ended < propCount) {
            end();
        }
    }, timeout + 1);

    elem.addEventListener(endEvent, onEnd);
}
