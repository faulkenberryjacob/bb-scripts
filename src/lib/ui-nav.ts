// import { CityName, LocationName } from "NetscriptDefinitions";
// import { CITY_LOCATIONS } from "./types";

// export  function travelToTarget(ns: NS, target: string): void {
//     // Determine what city the target is in
//     const currentCity = ns.getPlayer().city;

//     // Determine if we're in the target city
//     const desiredCity =  getCityOfLocation(ns, target);
//     let inCity = currentCity == desiredCity;

//     // If we're not in the target city, travel there
//     if (!inCity && ns.getPlayer().money > 2000000) {
//         ns.singularity.travelToCity(desiredCity);
//     }
// }

// export  function clickTargetFromCity(ns: NS, target: string): void {

// }

// export  function getCityOfLocation(ns: NS, location: string): CityName | undefined {
//     for (const city in CITY_LOCATIONS) {
//         if (CITY_LOCATIONS[city as CityName].includes(location as LocationName)) {
//             return city as CityName;
//         }
//     }
//     return undefined;
// }

export  function findByText(text: string): HTMLElement | null {
    const xpath = "//*[contains(text(), '" + text + "')]";
    return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as HTMLElement | null;
}

export  function findByXPath(xpath: string): HTMLElement | null {
    return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as HTMLElement | null;
}

export  function typeIntoActiveElement(text: string): void {
    const result =  typeIntoElement(document.activeElement as HTMLElement, text);
    return result;
}

export  function typeIntoElement(element: HTMLElement, text: string): void {
    (element as HTMLInputElement).focus();
    
    for (const char of text) {
        // Create and dispatch keydown event
        const keydownEvent = new KeyboardEvent('keydown', {
            key: char,
            code: char,
            bubbles: true,
            cancelable: true,
        });
        element.dispatchEvent(keydownEvent);
        
        // Update the element's value
        (element as HTMLInputElement).value += char;
        
        // Create and dispatch input event
        const inputEvent = new Event('input', { bubbles: true });
        element.dispatchEvent(inputEvent);
        
        // Create and dispatch keyup event
        const keyupEvent = new KeyboardEvent('keyup', {
            key: char,
            code: char,
            bubbles: true,
            cancelable: true,
        });
        element.dispatchEvent(keyupEvent);
    }
}

export async function pressSpacebar(ns: NS, delayMs: number = 50): void {
    const spacebarEvent = new KeyboardEvent('keydown', {
        key: ' ',
        code: 'Space',
        bubbles: true,
        cancelable: true,
    });
    document.dispatchEvent(spacebarEvent);
    
    await ns.sleep(delayMs);
    
    const spacebarUpEvent = new KeyboardEvent('keyup', {
        key: ' ',
        code: 'Space',
        bubbles: true,
        cancelable: true,
    });
    document.dispatchEvent(spacebarUpEvent);
}