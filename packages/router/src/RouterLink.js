import { NOOP } from "../../shared/index.js";
import { FunctionalComponent, h } from "../../runtime/index.js";
import { computed, reactive, unref } from "../../reactivity/index.js";
import { currentInstance, isSameRouteLocationParams } from "./Router.js";
import { getOriginalPath } from "./RouterMatcher.js";
import { isSameRouteRecord } from "./RouteRecord.js";

/**
 * Link um navigieren Mithilfe des Routers.
 * @class
 * @extends {FunctionalComponent}
 */
export class RouterLink extends FunctionalComponent {
    static tag = "router-link";

    static props() {
        return {
            to: {
                type: [String, Object],
                required: true
            },
            replace: {
                type: Boolean
            },
            activeClass: {
                type: String
            },
            exactActiveClass: {
                type: String
            },
            ariaCurrentValue: {
                type: String,
                default: "page"
            }
        };
    }

    setup(props) {
        const router = currentInstance;
        const currentRoute = router.currentRoute;

        const route = computed(() => router.resolve(unref(props.to)));

        const activeRecordIndex = computed(() => {
            const { matched } = route.value;
            const length = matched.length;
            const routeMatched = matched[length - 1];

            const currentMatched = currentRoute.value.matched;

            if (!routeMatched || !currentMatched.length) {
                return -1;
            }

            const index = currentMatched.findIndex(isSameRouteRecord.bind(null, routeMatched));

            if (index > -1) {
                return index;
            }

            const parentRecordPath = getOriginalPath(matched[length - 2]);

            return (
                length > 1 &&
                getOriginalPath(routeMatched) === parentRecordPath &&
                currentMatched[currentMatched.length - 1].path !== parentRecordPath
                    ? currentMatched.findIndex(isSameRouteRecord.bind(null, matched[length - 2]))
                    : index
            );
        });

        const isActive = computed(() =>
            activeRecordIndex.value > -1 &&
            includesParams(currentRoute.value.params, route.value.params)
        );

        const isExactActive = computed(() =>
            activeRecordIndex.value > -1 &&
            activeRecordIndex.value === currentRoute.value.matched.length - 1 &&
            isSameRouteLocationParams(currentRoute.value.params, route.value.params)
        );

        const classes = computed(() => ({
            [props.activeClass != null
                ? props.activeClass
                : router.options.linkActiveClass != null
                    ? router.options.linkActiveClass
                    : "router-link-active"
            ]: isActive.value,
            [props.exactActiveClass != null
                ? props.exactActiveClass
                : router.options.linkExactActiveClass != null
                    ? router.options.linkExactActiveClass
                    : "router-link-exact-active"
            ]: isExactActive.value
        }));

        function navigate(evt) {
            if (guardEvent(evt)) {
                return router[unref(props.replace) ? "replace" : "push"](
                    unref(props.to)
                ).catch(NOOP);
            }

            return Promise.resolve();
        }

        const link = reactive({
            route,
            href: computed(() => route.value.href),
            isActive,
            isExactActive,
            navigate
        });

        return {
            link,
            classes
        };
    }

    render(data, { props, slots }) {
        const children = slots.default?.(data.link);

        return h("a", {
            "aria-current": data.link.isExactActive ? props.ariaCurrentValue : null,
            "href": data.link.href,
            "onclick": data.link.navigate,
            "class": data.classes
        }, children);
    }
}

/**
 * Prüft, ob
 * @param {RouteLocation.params} outer
 * @param {RouteLocation.params} inner
 * @returns {boolean}
 */
function includesParams(outer, inner) {
    for (const key in inner) {
        const innerValue = inner[key];
        const outerValue = outer[key];

        if (typeof innerValue === "string") {
            if (innerValue !== outerValue) {
                return false;
            }
        } else if (!Array.isArray(outerValue) ||
            outerValue.length !== innerValue.length ||
            innerValue.some((value, i) => value !== outerValue[i])
        ) {
            return false;
        }
    }

    return true;
}

/**
 * Prüft, ob die Navigation durchgeführt werden soll.
 * @param {MouseEvent} evt - Das Event
 * @returns {boolean}
 */
function guardEvent(evt) {
    // Nicht navigieren, wenn eine Kontrolltaste gedrückt wurde
    if (evt.metaKey || evt.altKey || evt.ctrlKey || evt.shiftKey) {
        return false;
    }

    // Nicht navigieren, wenn preventDefault aufgerufen wurde
    if (evt.defaultPrevented) {
        return false;
    }

    // Bei Rechts-Klick nicht navigieren
    if (evt.button !== undefined && evt.button !== 0) {
        return false;
    }

    if (evt.currentTarget && evt.currentTarget.getAttribute) {
        const target = evt.currentTarget.getAttribute("target");

        if (/\b_blank\b/i.test(target)) {
            return false;
        }
    }

    // Wenn navigiert werden soll, verhindern das der Link aufgerufen wird
    if (evt.preventDefault) {
        evt.preventDefault();
    }

    return true;
}
