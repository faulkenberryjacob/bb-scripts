import { Logger } from "@/lib/logger";
import { findByText, findByXPath, pressSpacebar, typeIntoElement, typeIntoActiveElement } from "@/lib/ui-nav";
import { BRACKET_PAIRS } from "@/lib/types";

// ________________________________________________________________________________ 
//    Constants and Globals
// ````````````````````````````````````````````````````````````````````````````````

const infilLandingPageText: string = "is a series of short minigames that get progressively harder. You take damage for failing them. Reaching the maximum level rewards you with intel that you can trade for money or reputation";
const infilRewardPageText: string = "Infiltration successful!";
const rewardRepTradeXPath: string = "//button[contains(text(), 'Trade for')]/span[contains(@class, 'reputation')]";
const rewardMoneyTradeXPath: string = "//button[contains(text(), 'Sell for')]/span[contains(@class, 'money')]";


const sentinelText = "Attack after the sentinel drops his guard";
const bracketsText = "Close the brackets";
const bracketsXPath = "//h4[normalize-space(text())='Close the brackets']/following-sibling::p[1]";
const bracketsAnswerXPath = "";
const backwardsText = "Type it backward";
const guardText = "Say something nice about the guard";
const symbolsText = "Match the symbols";
const minesText = "Remember all the mines";
const wiresText = "Cut the wires with the following properties";

let isRunning = false;


// ________________________________________________________________________________ 
//    Main function 
// ````````````````````````````````````````````````````````````````````````````````

export async function main(ns: NS) {
    ns.disableLog("ALL");

    ns.atExit(() => {
        const container = document.getElementById('infil-control-window');
        if (container) {
            container.remove();
        }
    });

    const logger = new Logger(ns);
    const scriptName: string = ns.getScriptName();

    // Create the control window
    createControlWindow(ns);

    // Determine who gives us the most reputation per level
    //const target =  getBestTarget(ns);

    // Travel to the city of the target
    // travelToTarget(ns, target);

    // Click on target's location
    // clickTargetFromCity(ns, target);

    // Begin infiltration loop - only runs when button is toggled ON
    while (true) {
        if (isRunning) {
            // infilCurrentTarget(ns);
            const result =  completeRound(ns);
            if (!result) {
                logger.debug('No round found, continuing..');
            }
        }
        await ns.sleep(100);
    }



  
}

 function testTyping(text: string): void {
     typeIntoActiveElement(text);

}

// ________________________________________________________________________________ 
//    GUI
// ````````````````````````````````````````````````````````````````````````````````

function createControlWindow(ns: NS): void {
    const container = document.createElement('div');
    container.id = 'infil-control-window';
    container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 250px;
        background: #1a1a1a;
        border: 2px solid #00ff00;
        border-radius: 8px;
        padding: 15px;
        z-index: 9999;
        font-family: monospace;
        color: #00ff00;
    `;

    const title = document.createElement('div');
    title.textContent = 'Infiltration Control';
    title.style.cssText = `
        margin-bottom: 10px;
        font-weight: bold;
        font-size: 14px;
    `;

    const toggleButton = document.createElement('button');
    toggleButton.id = 'infil-toggle-btn';
    toggleButton.textContent = 'START';
    toggleButton.style.cssText = `
        width: 100%;
        padding: 10px;
        background: #00ff00;
        color: #000;
        border: none;
        border-radius: 4px;
        font-weight: bold;
        cursor: pointer;
        font-size: 14px;
        transition: background 0.3s;
    `;

    toggleButton.addEventListener('click', () => {
        isRunning = !isRunning;
        toggleButton.textContent = isRunning ? 'RUNNING' : 'START';
        toggleButton.style.background = isRunning ? '#ff0000' : '#00ff00';
    });

    const closeButton = document.createElement('button');
    closeButton.id = 'infil-close-btn';
    closeButton.textContent = 'CLOSE';
    closeButton.style.cssText = `
        width: 100%;
        padding: 8px;
        margin-top: 10px;
        background: #444;
        color: #fff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-family: monospace;
    `;

    closeButton.addEventListener('click', () => {
        container.remove();
        ns.exit();
    });

    container.appendChild(title);
    container.appendChild(toggleButton);
    container.appendChild(closeButton);
    document.body.appendChild(container); 
}

// ________________________________________________________________________________ 
//    Utility functions
// ````````````````````````````````````````````````````````````````````````````````

export function getMatchingBracket(bracket: string): string | undefined {
  return BRACKET_PAIRS[bracket];
}

// ________________________________________________________________________________ 
//    Minigame functions
// ````````````````````````````````````````````````````````````````````````````````

async function infilCurrentTarget(ns: NS) {
    const logger = new Logger(ns);
    let success = false as boolean;
    // Check that we're on the starting landing page
    logger.debug("Checking if we're on the infiltration landing page...",0);
    if( !( checkIfOnLandingPage(ns))) {
        logger.error("Not on infiltration landing page, cannot start infiltration",1);
        return;
    }
    logger.info("On infiltration landing page! Starting infiltration...",0);

    // Click Start
    const startButton =  findByText("Start") as HTMLElement;
    if (startButton) {
        logger.debug("Found start button, clicking to start infiltration...",0);
        startButton.click();
    } else {
        logger.error("Could not find start button, cannot start infiltration",1);
        return;
    }

    // Loop until we've succeeded or failed the infiltration
    while (!( checkIfOnRewardPage(ns))) {
        const roundComplete = await completeRound(ns) as boolean;
    }

    // Return the success and stats

}

 function checkIfOnLandingPage(ns: NS): boolean {

    const foundText =  findByText(infilLandingPageText);
    return foundText !== null;
    
}

 function checkIfOnRewardPage(ns: NS): boolean {
    const foundText =  findByText(infilRewardPageText);
    const success = foundText !== null;
    const repToTradeElement: Element | null =  findByXPath(rewardRepTradeXPath);
    let repToTrade: Number = 0;
    if (repToTradeElement) {
        // TODO: format string numbers (like 100k) to numeric format
        let tempTrade = repToTradeElement.textContent;
    }

    return foundText !== null;
}

async function completeRound(ns: NS) {
   //Determine what minigame this is
   if ( findByText(sentinelText)) {
    return await infilSentinel(ns);
   } else if ( findByText(bracketsText)) {
    return  infilBrackets(ns);
   } else if ( findByText(backwardsText)) {
    //return  infilBackwards(ns);
   } else if ( findByText(guardText)) {
    //return  infilGuard(ns);
   } else if ( findByText(symbolsText)) {
    //return  infilSymbols(ns);
   } else if ( findByText(minesText)) {
    //return  infilMines(ns);
   } else if ( findByText(wiresText)) {
    //return  infilWires(ns);
   } else { return false;}

   return false;
}

async function infilSentinel(ns: NS) {
    const logger = new Logger(ns);
    logger.debug("Beginning Sentinel minigame");
    // Wait on a loop. Cancel if it's been longer than ten seconds
    const startTime = Date.now();
    while (Date.now() - startTime < 10000) {
        logger.debug("Waiting for 'Distracted!' text to appear...",1);
        if ( findByText("Distracted!")) {
            logger.debug("'Distracted!' text found, pressing spacebar...",2);
             pressSpacebar(ns);
            return true;
        }
        await ns.sleep(100);
    }
    return false;
}

 function infilBrackets(ns: NS): boolean {
    const logger = new Logger(ns);
    logger.debug("Beginning Brackets minigame");

    // Get brackets
    logger.debug("Looking for brackets elements...",1);
    const bracketsElement: HTMLElement | null =  findByXPath(bracketsXPath);
    let bracketsString: string = "";
    if (bracketsElement) {
        bracketsString = bracketsElement.textContent ?? "";
        logger.debug(`Brackets string found: ${bracketsString}`,2);
    } else {
        logger.error("Could not find brackets element for brackets minigame",2);
        return false;
    }

    // Determine order of matching brackets by reversing the string and getting the corresponding bracket for each character
    const reversedString: string[] = bracketsString.split("").reverse();
    let answer: string[] = [];
    reversedString.forEach((bracket: string) => {
        answer.push(BRACKET_PAIRS[bracket]);
    });
    logger.debug(`Answer string: ${answer.join("")}`,1);

    // Type them in correct order
    logger.debug("Looking for answer input element...",1);
    // const answerElement: HTMLElement | null =  findByXPath(bracketsAnswerXPath);
    // if (!answerElement) {
    //     logger.error("Could not find answer element for brackets minigame",2);
    //     return false;
    // }
    logger.debug("Found element. Typing answer...",2);
    for (const char of answer.join("")) {
        logger.debug(`Typing character: ${char}`,3);
         typeIntoActiveElement(char);
    }
    return true;
}

//  function infilBackwards(ns: NS): boolean {

//}

//  function infilGuard(ns: NS): boolean {

// }

//  function infilSymbols(ns: NS): boolean {

// }

//  function infilMines(ns: NS): boolean {

// }

//  function infilWires(ns: NS): boolean {

// }

