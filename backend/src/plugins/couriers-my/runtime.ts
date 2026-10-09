import { Injector } from '@vendure/core';

/**
 * The application injector, set when the plugin boots. Lets plain exported objects (the EasyParcel rate
 * provider that delivery-my registers) reach this plugin's services without importing from delivery-my.
 */
let current: Injector | undefined;

export function setCouriersInjector(injector: Injector): void {
    current = injector;
}

export function couriersInjector(): Injector | undefined {
    return current;
}
