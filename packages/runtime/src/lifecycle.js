import { currentInstance } from "./WebComponent.js";

/**
 * Der LifecycleHook
 * @typedef {string} LifecycleHook
 */

/**
 *
 * @enum {LifecycleHook} LifecycleHooks
 */
export const LifecycleHooks = {
    BEFORE_MOUNT_HOOK: "#bm",
    MOUNTED_HOOK: "#m",
    BEFORE_UPDATE_HOOK: "#bu",
    UPDATED_HOOK: "#u",
    BEFORE_UNMOUNT_HOOK: "#bum",
    UNMOUNTED_HOOK: "#um"
};

/**
 * Der übergebene Hook wird vor dem Einbinden in den DOM ausgeführt.
 * @type {function(function(): void): void}
 */
export const onBeforeMount = fn => currentInstance?.addHook(LifecycleHooks.BEFORE_MOUNT_HOOK, fn);

/**
 * Der übergebene Hook wird nach dem Einbinden in den DOM ausgeführt.
 * @type {function(function(): void): void}
 */
export const onMounted = fn => currentInstance?.addHook(LifecycleHooks.MOUNTED_HOOK, fn);

/**
 * Der übergebene Hook wird vor dem Update des DOMs ausgeführt.
 * @type {function(function(): void): void}
 */
export const onBeforeUpdate = fn => currentInstance?.addHook(LifecycleHooks.BEFORE_UPDATE_HOOK, fn);

/**
 * Der übergebene Hook wird nach dem Update des DOMS ausgeführt.
 * @type {function(function(): void): void}
 */
export const onUpdated = fn => currentInstance?.addHook(LifecycleHooks.UPDATED_HOOK, fn);

/**
 * Der übergebene Hook wird vor dem Entfernen aus dem DOM ausgeführt.
 * @type {function(function(): void): void}
 */
export const onBeforeUnmount = fn => currentInstance?.addHook(LifecycleHooks.BEFORE_UNMOUNT_HOOK, fn);

/**
 * Der übergebene Hook wird nach dem Entfernen aus dem DOM ausgeführt.
 * @type {function(function(): void): void}
 */
export const onUnmounted = fn => currentInstance?.addHook(LifecycleHooks.UNMOUNTED_HOOK, fn);
